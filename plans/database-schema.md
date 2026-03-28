# Database Schema Design

> **Source:** [`technical-specification.md`](technical-specification.md)  
> **Location:** `packages/shared/src/db/schema.ts`  
> **ORM:** Drizzle ORM with PostgreSQL 16

---

## Design Principles

1. **Single source of truth** — All types derive from these Drizzle schemas via `drizzle-zod`
2. **State machine support** — `status` columns with constrained enum values
3. **Atomic counters** — `completedChapters` for race-condition-free chapter completion tracking
4. **Soft references** — `userId` from Clerk (not a foreign key, Clerk owns user data)
5. **JSONB for flexibility** — Style bible stored as structured JSON, validated by Zod at runtime

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                          books                               │
├─────────────────────────────────────────────────────────────┤
│ PK  id: uuid                                                │
│     userId: varchar(255)           -- Clerk user ID         │
│     title: varchar(500)                                     │
│     originalFileName: varchar(255)                          │
│     originalFileUrl: text          -- R2 URL                │
│     originalFileSize: integer      -- bytes                 │
│     status: book_status            -- enum                  │
│     styleBible: jsonb              -- StyleBible type       │
│     expectedChapters: integer      -- set after splitting   │
│     completedChapters: integer     -- atomic counter        │
│     errorMessage: text             -- if status = failed    │
│     publishedAt: timestamp                                  │
│     createdAt: timestamp                                    │
│     updatedAt: timestamp                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        chapters                              │
├─────────────────────────────────────────────────────────────┤
│ PK  id: uuid                                                │
│ FK  bookId: uuid                   -- references books.id   │
│     chapterNumber: integer         -- 1-indexed order       │
│     title: varchar(500)            -- AI-extracted title    │
│     startOffset: integer           -- char position in file │
│     endOffset: integer             -- char position in file │
│     content: text                  -- the chapter text      │
│     sceneDescription: text         -- AI-generated scene    │
│     imagePrompt: text              -- full prompt sent      │
│     imageUrl: text                 -- R2 URL                │
│     imageSeed: integer             -- for reproducibility   │
│     status: chapter_status         -- enum                  │
│     errorMessage: text             -- if status = failed    │
│     processingStartedAt: timestamp                          │
│     processingCompletedAt: timestamp                        │
│     createdAt: timestamp                                    │
│     updatedAt: timestamp                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Enum Definitions

### `book_status`

Maps to the state machine defined in [technical-specification.md §4.2](technical-specification.md#42-book-processing-pipeline-state-machine):

```sql
CREATE TYPE book_status AS ENUM (
  'uploading',        -- File received, being stored to R2
  'splitting',        -- AI analyzing text for chapter boundaries
  'generatingBible',  -- AI extracting characters/locations for style guide
  'illustrating',     -- N chapter workers processing in parallel
  'assembling',       -- All chapters done, creating final structure
  'published',        -- Complete, viewable in reader
  'failed'            -- Any stage failed after retries
);
```

**Transitions:**
```
uploading → splitting → generatingBible → illustrating → assembling → published
                                                                    ↘ failed
(any stage can → failed)
```

### `chapter_status`

```sql
CREATE TYPE chapter_status AS ENUM (
  'pending',      -- Created by splitter, awaiting processing
  'processing',   -- Worker picked up, calling AI APIs
  'completed',    -- Scene + image generated, stored in R2
  'failed'        -- AI call failed after retries
);
```

---

## Table Definitions (Drizzle Syntax)

### `books` table

```typescript
// packages/shared/src/db/schema.ts

import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const bookStatusEnum = pgEnum('book_status', [
  'uploading',
  'splitting',
  'generatingBible',
  'illustrating',
  'assembling',
  'published',
  'failed',
]);

export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Ownership (Clerk user ID, not a FK - Clerk owns user data)
  userId: varchar('user_id', { length: 255 }).notNull(),
  
  // Book metadata
  title: varchar('title', { length: 500 }).notNull(),
  originalFileName: varchar('original_file_name', { length: 255 }).notNull(),
  originalFileUrl: text('original_file_url').notNull(),
  originalFileSize: integer('original_file_size').notNull(), // bytes
  
  // State machine
  status: bookStatusEnum('status').notNull().default('uploading'),
  
  // Style bible (populated after generateStyleBible job)
  styleBible: jsonb('style_bible').$type<StyleBible | null>(),
  
  // Chapter tracking for atomic completion
  expectedChapters: integer('expected_chapters'), // null until splitter completes
  completedChapters: integer('completed_chapters').notNull().default(0),
  
  // Error tracking
  errorMessage: text('error_message'),
  
  // Timestamps
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### `chapters` table

```typescript
export const chapterStatusEnum = pgEnum('chapter_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Parent relationship
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  
  // Chapter metadata
  chapterNumber: integer('chapter_number').notNull(), // 1-indexed
  title: varchar('title', { length: 500 }).notNull(),
  
  // Text boundaries (character offsets in original file)
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  
  // Content
  content: text('content').notNull(), // the actual chapter text
  
  // AI-generated content
  sceneDescription: text('scene_description'), // populated by processChapter
  imagePrompt: text('image_prompt'),           // the full prompt sent to Pollinations
  imageUrl: text('image_url'),                 // R2 URL
  imageSeed: integer('image_seed'),            // for reproducibility
  
  // State machine
  status: chapterStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  
  // Timestamps
  processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## TypeScript Types (Generated via drizzle-zod)

```typescript
// packages/shared/src/db/index.ts

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { books, chapters, bookStatusEnum, chapterStatusEnum } from './schema';

// ----- Book Schemas -----

export const BookInsertSchema = createInsertSchema(books, {
  // Override/refine specific fields if needed
  title: z.string().min(1).max(500),
  originalFileName: z.string().min(1).max(255),
  originalFileUrl: z.string().url(),
  originalFileSize: z.number().int().positive(),
});

export const BookSelectSchema = createSelectSchema(books);

// Derived types
export type BookInsert = z.infer<typeof BookInsertSchema>;
export type BookSelect = z.infer<typeof BookSelectSchema>;
export type BookStatus = typeof bookStatusEnum.enumValues[number];

// ----- Chapter Schemas -----

export const ChapterInsertSchema = createInsertSchema(chapters, {
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
});

export const ChapterSelectSchema = createSelectSchema(chapters);

export type ChapterInsert = z.infer<typeof ChapterInsertSchema>;
export type ChapterSelect = z.infer<typeof ChapterSelectSchema>;
export type ChapterStatus = typeof chapterStatusEnum.enumValues[number];

// ----- API Response Schemas (extended from select schemas) -----

export const BookWithChaptersSchema = BookSelectSchema.extend({
  chapters: z.array(ChapterSelectSchema),
});

export type BookWithChapters = z.infer<typeof BookWithChaptersSchema>;

// Book list item (without full content)
export const BookListItemSchema = BookSelectSchema.pick({
  id: true,
  title: true,
  status: true,
  expectedChapters: true,
  completedChapters: true,
  publishedAt: true,
  createdAt: true,
});

export type BookListItem = z.infer<typeof BookListItemSchema>;
```

---

## StyleBible JSON Structure

The `styleBible` JSONB column stores the AI-generated style guide for character and location consistency. Validated by Zod at runtime.

```typescript
// packages/shared/src/db/styleBible.ts

import { z } from 'zod';

export const CharacterDescriptionSchema = z.object({
  name: z.string(),
  physicalDescription: z.string(),   // Hair, build, distinguishing features
  clothingStyle: z.string(),         // Typical attire
  personalityKeywords: z.array(z.string()), // For expression guidance
  firstAppearanceChapter: z.number().int().positive(),
});

export const LocationDescriptionSchema = z.object({
  name: z.string(),
  description: z.string(),           // Visual details
  atmosphereKeywords: z.array(z.string()), // Lighting, mood
  firstAppearanceChapter: z.number().int().positive(),
});

export const StyleBibleSchema = z.object({
  // Art direction
  artStyle: z.string(),              // e.g., "digital watercolor, warm tones"
  colorPalette: z.array(z.string()), // Primary colors
  technicalParams: z.string(),       // e.g., "soft lighting, storybook aesthetic"
  
  // Characters
  characters: z.array(CharacterDescriptionSchema),
  
  // Locations
  locations: z.array(LocationDescriptionSchema),
  
  // Metadata
  generatedAt: z.string().datetime(),
  modelUsed: z.string(),             // e.g., "groq/llama-3.3-70b"
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;
export type CharacterDescription = z.infer<typeof CharacterDescriptionSchema>;
export type LocationDescription = z.infer<typeof LocationDescriptionSchema>;
```

---

## Indexes

```typescript
// packages/shared/src/db/schema.ts (continued)

import { index } from 'drizzle-orm/pg-core';

// Books indexes
export const booksUserIdIdx = index('books_user_id_idx').on(books.userId);
export const booksStatusIdx = index('books_status_idx').on(books.status);
export const booksCreatedAtIdx = index('books_created_at_idx').on(books.createdAt);

// Chapters indexes
export const chaptersBookIdIdx = index('chapters_book_id_idx').on(chapters.bookId);
export const chaptersStatusIdx = index('chapters_status_idx').on(chapters.status);
export const chaptersBookIdChapterNumberIdx = index('chapters_book_id_chapter_number_idx')
  .on(chapters.bookId, chapters.chapterNumber);
```

---

## Key Queries

### Atomic Chapter Completion Counter

Used by [`processChapter`](technical-specification.md#42-book-processing-pipeline-state-machine) handler to determine if it's the last chapter:

```typescript
// apps/api/src/features/books/queries.ts

import { db } from '@shared/db';
import { books } from '@shared/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function incrementCompletedChapters(bookId: string) {
  const result = await db
    .update(books)
    .set({
      completedChapters: sql`${books.completedChapters} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(books.id, bookId))
    .returning({
      completedChapters: books.completedChapters,
      expectedChapters: books.expectedChapters,
    });
  
  return result[0]; // { completedChapters: 5, expectedChapters: 20 }
}
```

### Get Book with Chapters (for Reader)

```typescript
export async function getBookWithChapters(bookId: string, userId: string) {
  return db.query.books.findFirst({
    where: (books, { eq, and }) => and(
      eq(books.id, bookId),
      eq(books.userId, userId),
    ),
    with: {
      chapters: {
        orderBy: (chapters, { asc }) => [asc(chapters.chapterNumber)],
      },
    },
  });
}
```

### Update Book Status

```typescript
export async function updateBookStatus(
  bookId: string,
  status: BookStatus,
  errorMessage?: string,
) {
  const updates: Partial<BookInsert> = {
    status,
    updatedAt: new Date(),
  };
  
  if (status === 'failed' && errorMessage) {
    updates.errorMessage = errorMessage;
  }
  
  if (status === 'published') {
    updates.publishedAt = new Date();
  }
  
  return db
    .update(books)
    .set(updates)
    .where(eq(books.id, bookId))
    .returning();
}
```

---

## Migration

Initial migration generated by `drizzle-kit generate:pg`:

```sql
-- 0001_init.sql

-- Enums
CREATE TYPE book_status AS ENUM (
  'uploading', 'splitting', 'generatingBible', 
  'illustrating', 'assembling', 'published', 'failed'
);

CREATE TYPE chapter_status AS ENUM (
  'pending', 'processing', 'completed', 'failed'
);

-- Books table
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  original_file_url TEXT NOT NULL,
  original_file_size INTEGER NOT NULL,
  status book_status NOT NULL DEFAULT 'uploading',
  style_bible JSONB,
  expected_chapters INTEGER,
  completed_chapters INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chapters table
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  content TEXT NOT NULL,
  scene_description TEXT,
  image_prompt TEXT,
  image_url TEXT,
  image_seed INTEGER,
  status chapter_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX books_user_id_idx ON books(user_id);
CREATE INDEX books_status_idx ON books(status);
CREATE INDEX books_created_at_idx ON books(created_at);
CREATE INDEX chapters_book_id_idx ON chapters(book_id);
CREATE INDEX chapters_status_idx ON chapters(status);
CREATE INDEX chapters_book_id_chapter_number_idx ON chapters(book_id, chapter_number);
```

---

## Drizzle Relations

```typescript
// packages/shared/src/db/relations.ts

import { relations } from 'drizzle-orm';
import { books, chapters } from './schema';

export const booksRelations = relations(books, ({ many }) => ({
  chapters: many(chapters),
}));

export const chaptersRelations = relations(chapters, ({ one }) => ({
  book: one(books, {
    fields: [chapters.bookId],
    references: [books.id],
  }),
}));
```
