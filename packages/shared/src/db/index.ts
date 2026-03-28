import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { books, chapters } from './schema.js';

// Export table definitions
export * from './schema.js';

// ============================================================================
// Book Schemas
// ============================================================================

/**
 * Style bible structure (for JSONB field validation)
 */
export const StyleBibleSchema = z.object({
  characterDescriptions: z.array(
    z.object({
      name: z.string(),
      appearance: z.string(),
      traits: z.string(),
    })
  ),
  visualTone: z.string(),
  colorPalette: z.array(z.string()),
  sceneContext: z.string(),
});
export type StyleBible = z.infer<typeof StyleBibleSchema>;

/**
 * Full book record from database
 */
export const BookSelectSchema = createSelectSchema(books);
export type BookSelect = z.infer<typeof BookSelectSchema>;

/**
 * Book creation payload (without auto-generated fields)
 */
export const BookInsertSchema = createInsertSchema(books, {
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  originalFileUrl: z.string().url().optional(),
  styleBible: StyleBibleSchema.nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BookInsert = z.infer<typeof BookInsertSchema>;

/**
 * Book update payload (partial updates allowed)
 */
export const BookUpdateSchema = BookInsertSchema.partial();
export type BookUpdate = z.infer<typeof BookUpdateSchema>;

// ============================================================================
// Chapter Schemas
// ============================================================================

/**
 * Full chapter record from database
 */
export const ChapterSelectSchema = createSelectSchema(chapters);
export type ChapterSelect = z.infer<typeof ChapterSelectSchema>;

/**
 * Chapter creation payload (without auto-generated fields)
 */
export const ChapterInsertSchema = createInsertSchema(chapters, {
  bookId: z.string().uuid(),
  chapterNumber: z.string().regex(/^\d+$/),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ChapterInsert = z.infer<typeof ChapterInsertSchema>;

/**
 * Chapter update payload (partial updates allowed)
 */
export const ChapterUpdateSchema = ChapterInsertSchema.partial().omit({
  bookId: true, // Never update bookId after creation
  chapterNumber: true, // Never update chapterNumber after creation
});
export type ChapterUpdate = z.infer<typeof ChapterUpdateSchema>;
