import { eq, and } from "drizzle-orm";
import type { Database } from "../../types.js";
import { books } from "@illustrator/shared/db";
import type { BookInsert, BookUpdate } from "@illustrator/shared/db";

/**
 * Books data access layer
 * ONLY queries — no business logic, no side effects
 */

export async function findBookById(db: Database, bookId: string) {
  const [book] = await db
    .select()
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);
  return book ?? null;
}

export async function findBooksByUserId(db: Database, userId: string) {
  return db
    .select()
    .from(books)
    .where(eq(books.userId, userId))
    .orderBy(books.createdAt);
}

export async function findUserBook(
  db: Database,
  bookId: string,
  userId: string
) {
  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, userId)))
    .limit(1);
  return book ?? null;
}

export async function createBook(db: Database, data: BookInsert) {
  const [book] = await db.insert(books).values(data).returning();
  return book;
}

export async function updateBook(
  db: Database,
  bookId: string,
  data: BookUpdate
) {
  const [book] = await db
    .update(books)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(books.id, bookId))
    .returning();
  return book ?? null;
}

export async function deleteBook(db: Database, bookId: string) {
  await db.delete(books).where(eq(books.id, bookId));
}

/**
 * Atomic chapter completion counter
 * Returns updated counts for orchestration
 */
export async function incrementCompletedChapters(db: Database, bookId: string) {
  const [result] = await db
    .update(books)
    .set({
      completedChapters: String(Number(books.completedChapters) + 1),
      updatedAt: new Date(),
    })
    .where(eq(books.id, bookId))
    .returning({
      completedChapters: books.completedChapters,
      expectedChapters: books.expectedChapters,
    });
  return result;
}
