import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Book processing status enum
 * State machine: uploading → splitting → generatingBible → illustrating → assembling → published
 *                                                                                     ↘ failed
 */
export const bookStatus = pgEnum('book_status', [
  'uploading',
  'splitting',
  'generatingBible',
  'illustrating',
  'assembling',
  'published',
  'failed',
]);

/**
 * Chapter processing status enum
 */
export const chapterStatus = pgEnum('chapter_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

/**
 * Books table
 * Stores uploaded books and their processing state
 */
export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  status: bookStatus('status').notNull().default('uploading'),

  // File references
  originalFileUrl: text('original_file_url'),
  finalPdfUrl: text('final_pdf_url'),

  // Style bible (JSONB: { characterDescriptions, visualTone, colorPalette, sceneContext })
  styleBible: jsonb('style_bible').$type<{
    characterDescriptions: Array<{
      name: string;
      appearance: string;
      traits: string;
    }>;
    visualTone: string;
    colorPalette: string[];
    sceneContext: string;
  }>(),

  // Chapter tracking for atomic counter pattern
  expectedChapters: text('expected_chapters'), // null until splitter completes
  completedChapters: text('completed_chapters').default('0'),

  // Error tracking
  errorMessage: text('error_message'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Chapters table
 * Stores individual chapters split from books
 */
export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),

  // Chapter metadata
  chapterNumber: text('chapter_number').notNull(), // "1", "2", "3"
  title: text('title').notNull(),
  content: text('content').notNull(), // Full chapter text

  // Processing state
  status: chapterStatus('status').notNull().default('pending'),

  // AI-generated scene description for illustration
  sceneDescription: text('scene_description'),

  // Generated illustration URL
  illustrationUrl: text('illustration_url'),

  // Error tracking
  errorMessage: text('error_message'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
