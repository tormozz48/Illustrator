import type { Database } from "../../types.js";
import * as queries from "./queries.js";

/**
 * Chapters business logic layer
 * Orchestrates queries, validates rules
 */

export async function getBookChapters(db: Database, bookId: string) {
  return queries.findChaptersByBookId(db, bookId);
}

export async function getUserChapter(
  db: Database,
  chapterId: string,
  userId: string
) {
  const chapter = await queries.findUserChapter(db, chapterId, userId);

  if (!chapter) {
    throw new Error("Chapter not found or access denied");
  }

  return chapter;
}
