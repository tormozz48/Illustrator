# AI Service Schemas

> **Source:** [`technical-specification.md`](technical-specification.md)  
> **Location:** `packages/shared/src/ai/schemas.ts` and `apps/worker/src/services/`  
> **AI Services:** Groq (text), Pollinations (images)

---

## Overview

All AI API responses are validated through Zod schemas before processing. This catches malformed responses at runtime and provides type-safe data throughout the pipeline.

---

## Text Processing (Groq / Llama 3.3 70B)

### Service Configuration

```typescript
// apps/worker/src/services/groq.ts

import Groq from 'groq-sdk';
import { env } from '../env';

export const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
});

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3; // Low for consistent structured output
```

---

### 1. Chapter Splitting

**Purpose:** Detect chapter boundaries in uploaded text file.

**Prompt Template:**
```typescript
// apps/worker/src/services/prompts/splitChapters.ts

export function buildSplitChaptersPrompt(bookContent: string): string {
  return `You are a book structure analyzer. Analyze the following text and identify all chapter boundaries.

For each chapter, provide:
- The chapter number (starting from 1)
- The chapter title (if explicit) or a generated title based on content
- The start character offset (0-indexed position where the chapter begins)
- The end character offset (position where the chapter ends)

Rules:
- Look for patterns like "Chapter 1", "CHAPTER ONE", "Part 1", or similar markers
- If no explicit markers, detect natural breaks (large gaps, scene changes)
- Include prologues, epilogues, and introductions as separate entries
- Ensure offsets cover the entire text with no gaps or overlaps

Return ONLY valid JSON in this exact format:
{
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "The Beginning",
      "startOffset": 0,
      "endOffset": 5420
    }
  ]
}

TEXT TO ANALYZE:
---
${bookContent.slice(0, 100000)}
---

JSON Response:`;
}
```

**Response Schema:**
```typescript
// packages/shared/src/ai/schemas.ts

import { z } from 'zod';

export const ChapterBoundarySchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string().min(1).max(500),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
});

export const SplitChaptersResponseSchema = z.object({
  chapters: z.array(ChapterBoundarySchema).min(1),
});

export type ChapterBoundary = z.infer<typeof ChapterBoundarySchema>;
export type SplitChaptersResponse = z.infer<typeof SplitChaptersResponseSchema>;
```

**Service Function:**
```typescript
// apps/worker/src/services/groq.ts

import { SplitChaptersResponseSchema } from '@shared/ai/schemas';
import { buildSplitChaptersPrompt } from './prompts/splitChapters';

export async function splitChapters(bookContent: string): Promise<SplitChaptersResponse> {
  const prompt = buildSplitChaptersPrompt(bookContent);
  
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  });
  
  const rawResponse = completion.choices[0]?.message?.content;
  if (!rawResponse) {
    throw new Error('Groq returned empty response');
  }
  
  const parsed = JSON.parse(rawResponse);
  return SplitChaptersResponseSchema.parse(parsed);
}
```

---

### 2. Style Bible Generation

**Purpose:** Extract characters, locations, and art direction from the book.

**Prompt Template:**
```typescript
// apps/worker/src/services/prompts/generateStyleBible.ts

export function buildStyleBiblePrompt(bookContent: string): string {
  return `You are a visual style guide creator for illustrated books. Analyze this book and create a comprehensive style bible for consistent illustration.

Extract:
1. ART STYLE: Recommend an illustration style (e.g., "digital watercolor", "pen and ink", "oil painting style")
2. COLOR PALETTE: 3-5 primary colors that match the book's mood
3. TECHNICAL PARAMS: Lighting, atmosphere descriptors
4. CHARACTERS: All named characters with detailed physical descriptions
5. LOCATIONS: All significant settings with visual details

For characters, include:
- Full name
- Physical description (hair color/style, eye color, build, age appearance, distinguishing features)
- Typical clothing/attire
- Personality keywords (for expression guidance)
- First chapter where they appear

For locations, include:
- Name/type of location
- Visual description (architecture, nature, objects)
- Atmosphere keywords (lighting, mood, weather)
- First chapter where it appears

Return ONLY valid JSON in this exact format:
{
  "artStyle": "digital watercolor illustration with soft edges",
  "colorPalette": ["#8B4513", "#F5DEB3", "#228B22", "#4682B4", "#FFD700"],
  "technicalParams": "warm natural lighting, storybook aesthetic, soft shadows",
  "characters": [
    {
      "name": "Character Name",
      "physicalDescription": "Detailed physical description...",
      "clothingStyle": "Typical attire description...",
      "personalityKeywords": ["brave", "curious", "kind"],
      "firstAppearanceChapter": 1
    }
  ],
  "locations": [
    {
      "name": "Location Name",
      "description": "Visual description...",
      "atmosphereKeywords": ["cozy", "dimly lit", "rustic"],
      "firstAppearanceChapter": 1
    }
  ]
}

BOOK TEXT:
---
${bookContent.slice(0, 80000)}
---

JSON Response:`;
}
```

**Response Schema:**
```typescript
// packages/shared/src/ai/schemas.ts

export const CharacterDescriptionSchema = z.object({
  name: z.string().min(1),
  physicalDescription: z.string().min(10),
  clothingStyle: z.string().min(5),
  personalityKeywords: z.array(z.string()).min(1).max(10),
  firstAppearanceChapter: z.number().int().positive(),
});

export const LocationDescriptionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  atmosphereKeywords: z.array(z.string()).min(1).max(10),
  firstAppearanceChapter: z.number().int().positive(),
});

export const StyleBibleResponseSchema = z.object({
  artStyle: z.string().min(10),
  colorPalette: z.array(z.string()).min(3).max(10),
  technicalParams: z.string().min(10),
  characters: z.array(CharacterDescriptionSchema),
  locations: z.array(LocationDescriptionSchema),
});

export type CharacterDescription = z.infer<typeof CharacterDescriptionSchema>;
export type LocationDescription = z.infer<typeof LocationDescriptionSchema>;
export type StyleBibleResponse = z.infer<typeof StyleBibleResponseSchema>;
```

**Service Function:**
```typescript
export async function generateStyleBible(bookContent: string): Promise<StyleBible> {
  const prompt = buildStyleBiblePrompt(bookContent);
  
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  });
  
  const rawResponse = completion.choices[0]?.message?.content;
  if (!rawResponse) {
    throw new Error('Groq returned empty response');
  }
  
  const parsed = JSON.parse(rawResponse);
  const validated = StyleBibleResponseSchema.parse(parsed);
  
  // Add metadata
  return {
    ...validated,
    generatedAt: new Date().toISOString(),
    modelUsed: MODEL,
  };
}
```

---

### 3. Scene Description Generation

**Purpose:** Extract the most visually compelling scene from a chapter for illustration.

**Prompt Template:**
```typescript
// apps/worker/src/services/prompts/generateSceneDescription.ts

import { StyleBible } from '@shared/ai/schemas';

export function buildSceneDescriptionPrompt(
  chapterContent: string,
  styleBible: StyleBible,
  chapterNumber: number,
): string {
  // Build character reference
  const characterRef = styleBible.characters
    .map(c => `- ${c.name}: ${c.physicalDescription}. Wearing: ${c.clothingStyle}`)
    .join('\n');
  
  // Build location reference
  const locationRef = styleBible.locations
    .map(l => `- ${l.name}: ${l.description}`)
    .join('\n');
  
  return `You are an art director selecting a scene to illustrate for a chapter.

STYLE GUIDE:
- Art Style: ${styleBible.artStyle}
- Color Palette: ${styleBible.colorPalette.join(', ')}
- Technical: ${styleBible.technicalParams}

KNOWN CHARACTERS:
${characterRef || 'No named characters yet.'}

KNOWN LOCATIONS:
${locationRef || 'No specific locations yet.'}

CHAPTER ${chapterNumber} CONTENT:
---
${chapterContent.slice(0, 15000)}
---

TASK:
Select the single most visually compelling and emotionally significant moment from this chapter. Describe it in 2-3 sentences as a scene that could be illustrated.

Focus on:
- A specific moment, not a summary
- Visual elements (who is present, what are they doing, where are they)
- Emotional tone and lighting

Return ONLY valid JSON:
{
  "sceneDescription": "A vivid 2-3 sentence description of the scene...",
  "charactersInScene": ["Character Name 1", "Character Name 2"],
  "locationName": "Location name or 'Unknown'",
  "emotionalTone": "hopeful" | "tense" | "melancholic" | "joyful" | "mysterious" | "dramatic" | "peaceful" | "fearful"
}

JSON Response:`;
}
```

**Response Schema:**
```typescript
// packages/shared/src/ai/schemas.ts

export const EmotionalToneSchema = z.enum([
  'hopeful',
  'tense',
  'melancholic',
  'joyful',
  'mysterious',
  'dramatic',
  'peaceful',
  'fearful',
]);

export const SceneDescriptionResponseSchema = z.object({
  sceneDescription: z.string().min(50).max(1000),
  charactersInScene: z.array(z.string()),
  locationName: z.string(),
  emotionalTone: EmotionalToneSchema,
});

export type EmotionalTone = z.infer<typeof EmotionalToneSchema>;
export type SceneDescriptionResponse = z.infer<typeof SceneDescriptionResponseSchema>;
```

---

## Image Generation (Pollinations.ai)

### Service Configuration

```typescript
// apps/worker/src/services/pollinations.ts

const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai/prompt';
const DEFAULT_MODEL = 'flux';
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
```

### Image Prompt Builder

**Purpose:** Combine style bible + scene description into a consistent image prompt.

```typescript
// apps/worker/src/services/prompts/buildImagePrompt.ts

import { StyleBible, SceneDescriptionResponse } from '@shared/ai/schemas';

export function buildImagePrompt(
  styleBible: StyleBible,
  scene: SceneDescriptionResponse,
): string {
  // Find characters in this scene
  const relevantCharacters = styleBible.characters
    .filter(c => scene.charactersInScene.includes(c.name))
    .map(c => `${c.name}: ${c.physicalDescription}, wearing ${c.clothingStyle}`)
    .join('. ');
  
  // Find location
  const location = styleBible.locations
    .find(l => l.name.toLowerCase() === scene.locationName.toLowerCase());
  const locationDesc = location 
    ? `Setting: ${location.description}` 
    : '';
  
  // Emotional tone to lighting/mood mapping
  const toneMapping: Record<string, string> = {
    hopeful: 'warm golden hour lighting, optimistic atmosphere',
    tense: 'dramatic shadows, high contrast lighting',
    melancholic: 'soft overcast lighting, muted tones',
    joyful: 'bright cheerful lighting, vibrant colors',
    mysterious: 'soft fog, moonlight, ethereal glow',
    dramatic: 'strong directional lighting, bold shadows',
    peaceful: 'gentle diffused lighting, serene mood',
    fearful: 'dark shadows, cold blue undertones',
  };
  const moodLighting = toneMapping[scene.emotionalTone] || styleBible.technicalParams;
  
  // Build final prompt
  const parts = [
    styleBible.artStyle,                          // Art style first
    scene.sceneDescription,                        // The actual scene
    relevantCharacters,                           // Character descriptions
    locationDesc,                                 // Location description
    moodLighting,                                 // Mood/lighting
    styleBible.technicalParams,                   // Technical params
    'masterpiece, high quality, detailed',        // Quality boosters
    `color palette: ${styleBible.colorPalette.slice(0, 3).join(', ')}`,
  ];
  
  return parts.filter(Boolean).join(', ');
}
```

### Image Generation Service

```typescript
// apps/worker/src/services/pollinations.ts

import { z } from 'zod';

export const GenerateImageOptionsSchema = z.object({
  prompt: z.string().min(10),
  width: z.number().int().positive().default(DEFAULT_WIDTH),
  height: z.number().int().positive().default(DEFAULT_HEIGHT),
  seed: z.number().int().optional(), // For reproducibility
  model: z.string().default(DEFAULT_MODEL),
  nologo: z.boolean().default(true),
  enhance: z.boolean().default(true),
});

export type GenerateImageOptions = z.infer<typeof GenerateImageOptionsSchema>;

export interface GenerateImageResult {
  imageBuffer: Buffer;
  seed: number;
  prompt: string;
}

export async function generateImage(
  options: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const validated = GenerateImageOptionsSchema.parse(options);
  
  // Generate random seed if not provided
  const seed = validated.seed ?? Math.floor(Math.random() * 2147483647);
  
  // Build URL
  const params = new URLSearchParams({
    width: String(validated.width),
    height: String(validated.height),
    seed: String(seed),
    model: validated.model,
    nologo: String(validated.nologo),
    enhance: String(validated.enhance),
  });
  
  const encodedPrompt = encodeURIComponent(validated.prompt);
  const url = `${POLLINATIONS_BASE_URL}/${encodedPrompt}?${params}`;
  
  // Fetch with timeout and retry
  const response = await fetchWithRetry(url, {
    timeout: 60000, // 60s timeout for image generation
    retries: 3,
    retryDelay: 5000,
  });
  
  if (!response.ok) {
    throw new Error(`Pollinations returned ${response.status}: ${response.statusText}`);
  }
  
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  
  return {
    imageBuffer,
    seed,
    prompt: validated.prompt,
  };
}
```

---

## Retry and Error Handling

```typescript
// apps/worker/src/services/utils/fetchWithRetry.ts

interface FetchWithRetryOptions {
  timeout: number;
  retries: number;
  retryDelay: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions,
): Promise<Response> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);
      
      const response = await fetch(url, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
      
      // Retry on 5xx errors
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Don't retry on 4xx
      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < options.retries) {
        await sleep(options.retryDelay * attempt); // Exponential backoff
      }
    }
  }
  
  throw lastError ?? new Error('Request failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## AI Response Validation Wrapper

```typescript
// packages/shared/src/ai/validate.ts

import { z } from 'zod';
import pino from 'pino';

const logger = pino({ name: 'ai-validation' });

export async function validateAIResponse<T extends z.ZodSchema>(
  rawResponse: string,
  schema: T,
  context: { model: string; prompt: string },
): Promise<z.infer<T>> {
  try {
    const parsed = JSON.parse(rawResponse);
    return schema.parse(parsed);
  } catch (error) {
    logger.error({
      error,
      rawResponse: rawResponse.slice(0, 500),
      model: context.model,
      promptPreview: context.prompt.slice(0, 200),
    }, 'AI response validation failed');
    
    throw new Error(`AI response validation failed: ${(error as Error).message}`);
  }
}
```

---

## Full AI Schemas Export

```typescript
// packages/shared/src/ai/schemas.ts

import { z } from 'zod';

// Re-export all schemas
export { ChapterBoundarySchema, SplitChaptersResponseSchema } from './splitChapters';
export { CharacterDescriptionSchema, LocationDescriptionSchema, StyleBibleResponseSchema } from './styleBible';
export { EmotionalToneSchema, SceneDescriptionResponseSchema } from './sceneDescription';
export { GenerateImageOptionsSchema } from './imageGeneration';

// Combined StyleBible type (stored in DB)
export const StyleBibleSchema = z.object({
  artStyle: z.string(),
  colorPalette: z.array(z.string()),
  technicalParams: z.string(),
  characters: z.array(CharacterDescriptionSchema),
  locations: z.array(LocationDescriptionSchema),
  generatedAt: z.string().datetime(),
  modelUsed: z.string(),
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;
```
