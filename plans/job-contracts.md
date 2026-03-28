# BullMQ Job Contracts

> **Source:** [`technical-specification.md`](technical-specification.md)  
> **Location:** `packages/shared/src/jobs/contracts.ts`  
> **Queue:** BullMQ with Redis 7

---

## Overview

Job contracts define the **type-safe interface** between the API (job producer) and workers (job consumers). All jobs flow through a single BullMQ queue named `book-processing`.

**State machine pipeline:** Each job handler completes → dispatches the next stage's job(s).

```
splitChapters → generateStyleBible → processChapter (×N) → assembleBook
```

---

## Job Registry

| Job Name | Dispatched By | Dispatches Next | Payload |
|---|---|---|---|
| `splitChapters` | API (after upload) | `generateStyleBible` | `{ bookId, fileUrl }` |
| `generateStyleBible` | `splitChapters` handler | `processChapter` (×N) | `{ bookId }` |
| `processChapter` | `generateStyleBible` handler | `assembleBook` (if last) | `{ bookId, chapterId, chapterNumber }` |
| `assembleBook` | `processChapter` handler (last one) | — | `{ bookId }` |

---

## Job Definitions

### 1. `splitChapters`

**Purpose:** Analyze uploaded text file, detect chapter boundaries, create chapter DB rows.

**Dispatched by:** API upload handler after storing file in R2  
**Updates book status:** `uploading` → `splitting`  
**On completion:** Dispatches `generateStyleBible`  
**Updates book status:** `splitting` → `generatingBible`

```typescript
// packages/shared/src/jobs/contracts.ts

import { z } from 'zod';

export const SplitChaptersPayloadSchema = z.object({
  bookId: z.string().uuid(),
  fileUrl: z.string().url(),  // R2 URL to the uploaded .txt file
});

export type SplitChaptersPayload = z.infer<typeof SplitChaptersPayloadSchema>;

// What the handler returns (for logging/debugging, not used downstream)
export const SplitChaptersResultSchema = z.object({
  chapterCount: z.number().int().positive(),
  chapterIds: z.array(z.string().uuid()),
});

export type SplitChaptersResult = z.infer<typeof SplitChaptersResultSchema>;
```

**Handler pseudocode:**
```typescript
// apps/worker/src/handlers/splitChapters.ts

async function handleSplitChapters(job: Job<SplitChaptersPayload>) {
  const { bookId, fileUrl } = job.data;
  
  // 1. Download file from R2
  const content = await storage.downloadText(fileUrl);
  
  // 2. Call Groq to split into chapters
  const chapters = await groq.splitChapters(content);
  
  // 3. Create chapter rows in DB
  const chapterIds = await queries.createChapters(bookId, chapters);
  
  // 4. Update book with expected chapter count
  await queries.updateBook(bookId, { 
    expectedChapters: chapters.length,
    status: 'generatingBible',
  });
  
  // 5. Dispatch next job
  await jobs.dispatch('generateStyleBible', { bookId });
  
  return { chapterCount: chapters.length, chapterIds };
}
```

---

### 2. `generateStyleBible`

**Purpose:** Extract characters, locations, and art direction from the full book text.

**Dispatched by:** `splitChapters` handler  
**Updates book status:** `splitting` → `generatingBible`  
**On completion:** Dispatches N × `processChapter` jobs  
**Updates book status:** `generatingBible` → `illustrating`

```typescript
export const GenerateStyleBiblePayloadSchema = z.object({
  bookId: z.string().uuid(),
});

export type GenerateStyleBiblePayload = z.infer<typeof GenerateStyleBiblePayloadSchema>;

export const GenerateStyleBibleResultSchema = z.object({
  characterCount: z.number().int().nonnegative(),
  locationCount: z.number().int().nonnegative(),
  chaptersDispatched: z.number().int().positive(),
});

export type GenerateStyleBibleResult = z.infer<typeof GenerateStyleBibleResultSchema>;
```

**Handler pseudocode:**
```typescript
// apps/worker/src/handlers/generateStyleBible.ts

async function handleGenerateStyleBible(job: Job<GenerateStyleBiblePayload>) {
  const { bookId } = job.data;
  
  // 1. Get book with all chapter content
  const book = await queries.getBookWithChapters(bookId);
  const fullText = book.chapters.map(c => c.content).join('\n\n');
  
  // 2. Call Groq to generate style bible
  const styleBible = await groq.generateStyleBible(fullText);
  
  // 3. Store style bible on book
  await queries.updateBook(bookId, { 
    styleBible,
    status: 'illustrating',
  });
  
  // 4. Dispatch processChapter for each chapter
  for (const chapter of book.chapters) {
    await jobs.dispatch('processChapter', {
      bookId,
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
    });
  }
  
  return {
    characterCount: styleBible.characters.length,
    locationCount: styleBible.locations.length,
    chaptersDispatched: book.chapters.length,
  };
}
```

---

### 3. `processChapter`

**Purpose:** Generate scene description and illustration for a single chapter.

**Dispatched by:** `generateStyleBible` handler (N instances)  
**Runs in parallel:** Up to 2-3 concurrent workers (respects AI rate limits)  
**On completion:** Increments `completedChapters`, dispatches `assembleBook` if last  
**Updates book status:** *(none — book stays `illustrating` until all done)*

```typescript
export const ProcessChapterPayloadSchema = z.object({
  bookId: z.string().uuid(),
  chapterId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
});

export type ProcessChapterPayload = z.infer<typeof ProcessChapterPayloadSchema>;

export const ProcessChapterResultSchema = z.object({
  sceneDescription: z.string(),
  imageUrl: z.string().url(),
  imageSeed: z.number().int(),
});

export type ProcessChapterResult = z.infer<typeof ProcessChapterResultSchema>;
```

**Handler pseudocode:**
```typescript
// apps/worker/src/handlers/processChapter.ts

async function handleProcessChapter(job: Job<ProcessChapterPayload>) {
  const { bookId, chapterId, chapterNumber } = job.data;
  
  // 1. Get chapter and book (with style bible)
  const chapter = await queries.getChapter(chapterId);
  const book = await queries.getBook(bookId);
  
  // 2. Mark chapter as processing
  await queries.updateChapter(chapterId, { 
    status: 'processing',
    processingStartedAt: new Date(),
  });
  
  // 3. Call Groq to generate scene description
  const sceneDescription = await groq.generateSceneDescription(
    chapter.content,
    book.styleBible,
  );
  
  // 4. Build image prompt from style bible + scene
  const imagePrompt = buildImagePrompt(book.styleBible, sceneDescription);
  
  // 5. Call Pollinations to generate image
  const { imageBuffer, seed } = await pollinations.generateImage(imagePrompt);
  
  // 6. Upload to R2
  const imageUrl = await storage.uploadImage(bookId, chapterId, imageBuffer);
  
  // 7. Update chapter
  await queries.updateChapter(chapterId, {
    sceneDescription,
    imagePrompt,
    imageUrl,
    imageSeed: seed,
    status: 'completed',
    processingCompletedAt: new Date(),
  });
  
  // 8. Atomic increment + check if last
  const { completedChapters, expectedChapters } = 
    await queries.incrementCompletedChapters(bookId);
  
  if (completedChapters === expectedChapters) {
    // All chapters done — dispatch assembly
    await queries.updateBook(bookId, { status: 'assembling' });
    await jobs.dispatch('assembleBook', { bookId });
  }
  
  return { sceneDescription, imageUrl, imageSeed: seed };
}
```

---

### 4. `assembleBook`

**Purpose:** Combine all chapters and images into final published structure.

**Dispatched by:** `processChapter` handler (the one that completes last)  
**Updates book status:** `illustrating` → `assembling` → `published`

```typescript
export const AssembleBookPayloadSchema = z.object({
  bookId: z.string().uuid(),
});

export type AssembleBookPayload = z.infer<typeof AssembleBookPayloadSchema>;

export const AssembleBookResultSchema = z.object({
  totalChapters: z.number().int().positive(),
  totalImages: z.number().int().positive(),
  publishedAt: z.string().datetime(),
});

export type AssembleBookResult = z.infer<typeof AssembleBookResultSchema>;
```

**Handler pseudocode:**
```typescript
// apps/worker/src/handlers/assembleBook.ts

async function handleAssembleBook(job: Job<AssembleBookPayload>) {
  const { bookId } = job.data;
  
  // 1. Get book with all chapters
  const book = await queries.getBookWithChapters(bookId);
  
  // 2. Verify all chapters have images
  const allComplete = book.chapters.every(c => c.status === 'completed');
  if (!allComplete) {
    throw new Error('Not all chapters completed');
  }
  
  // 3. Optional: Generate cover image, table of contents, etc.
  // (Future enhancement)
  
  // 4. Mark as published
  const now = new Date();
  await queries.updateBook(bookId, {
    status: 'published',
    publishedAt: now,
  });
  
  return {
    totalChapters: book.chapters.length,
    totalImages: book.chapters.filter(c => c.imageUrl).length,
    publishedAt: now.toISOString(),
  };
}
```

---

## Job Options & Retry Configuration

```typescript
// packages/shared/src/jobs/config.ts

import { JobsOptions } from 'bullmq';

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s, 10s, 20s
  },
  removeOnComplete: {
    age: 24 * 60 * 60,  // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days (for debugging)
  },
};

// Per-job overrides
export const jobOptions: Record<string, Partial<JobsOptions>> = {
  splitChapters: {
    attempts: 2, // Text analysis rarely needs retry
  },
  generateStyleBible: {
    attempts: 3,
  },
  processChapter: {
    attempts: 5, // Image generation is flaky
    backoff: {
      type: 'exponential',
      delay: 10000, // 10s, 20s, 40s, 80s, 160s
    },
  },
  assembleBook: {
    attempts: 2, // Just DB updates, should succeed
  },
};
```

---

## Queue Concurrency

```typescript
// apps/worker/src/index.ts

import { Worker } from 'bullmq';
import { redis } from './redis';

// Max 2-3 concurrent jobs to respect AI API rate limits
const worker = new Worker('book-processing', processor, {
  connection: redis,
  concurrency: 2,
  limiter: {
    max: 30,
    duration: 60000, // 30 jobs per minute max
  },
});
```

---

## Error Handling

When a job fails after all retries:

```typescript
// apps/worker/src/handlers/errorHandler.ts

import { Job } from 'bullmq';
import { queries } from '@shared/db';

export async function handleJobFailure(job: Job, error: Error) {
  const { bookId, chapterId } = job.data;
  
  // Update chapter status if applicable
  if (chapterId) {
    await queries.updateChapter(chapterId, {
      status: 'failed',
      errorMessage: error.message,
    });
  }
  
  // Mark entire book as failed
  await queries.updateBook(bookId, {
    status: 'failed',
    errorMessage: `Job ${job.name} failed: ${error.message}`,
  });
  
  // Log for debugging
  logger.error({
    jobId: job.id,
    jobName: job.name,
    bookId,
    chapterId,
    error: error.message,
    stack: error.stack,
  }, 'Job failed after all retries');
}
```

---

## Job Dispatch Utility

```typescript
// packages/shared/src/jobs/dispatch.ts

import { Queue } from 'bullmq';
import { redis } from './redis';
import { defaultJobOptions, jobOptions } from './config';
import {
  SplitChaptersPayload,
  GenerateStyleBiblePayload,
  ProcessChapterPayload,
  AssembleBookPayload,
} from './contracts';

const queue = new Queue('book-processing', { connection: redis });

type JobPayloads = {
  splitChapters: SplitChaptersPayload;
  generateStyleBible: GenerateStyleBiblePayload;
  processChapter: ProcessChapterPayload;
  assembleBook: AssembleBookPayload;
};

export async function dispatch<K extends keyof JobPayloads>(
  name: K,
  data: JobPayloads[K],
) {
  return queue.add(name, data, {
    ...defaultJobOptions,
    ...jobOptions[name],
  });
}
```

**Usage in API or worker handlers:**
```typescript
import { dispatch } from '@shared/jobs';

// In API upload handler
await dispatch('splitChapters', { bookId: book.id, fileUrl });

// In splitChapters handler
await dispatch('generateStyleBible', { bookId });

// In generateStyleBible handler
for (const chapter of chapters) {
  await dispatch('processChapter', { 
    bookId, 
    chapterId: chapter.id, 
    chapterNumber: chapter.chapterNumber,
  });
}

// In processChapter handler (when last)
await dispatch('assembleBook', { bookId });
```

---

## Progress Events (for SSE)

Workers report progress for frontend progress bars:

```typescript
// apps/worker/src/handlers/processChapter.ts

async function handleProcessChapter(job: Job<ProcessChapterPayload>) {
  // ...
  
  // Report progress at each step
  await job.updateProgress({ step: 'downloading', percent: 10 });
  // ... download content
  
  await job.updateProgress({ step: 'generatingScene', percent: 30 });
  // ... call Groq
  
  await job.updateProgress({ step: 'generatingImage', percent: 60 });
  // ... call Pollinations
  
  await job.updateProgress({ step: 'uploading', percent: 90 });
  // ... upload to R2
  
  await job.updateProgress({ step: 'completed', percent: 100 });
  // ...
}
```

**Progress schema:**
```typescript
export const JobProgressSchema = z.object({
  step: z.enum([
    'downloading',
    'splitting',
    'generatingBible',
    'generatingScene',
    'generatingImage',
    'uploading',
    'completed',
  ]),
  percent: z.number().int().min(0).max(100),
});

export type JobProgress = z.infer<typeof JobProgressSchema>;
```
