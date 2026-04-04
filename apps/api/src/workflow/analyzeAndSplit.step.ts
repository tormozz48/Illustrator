import {
  buildBible,
  getLogger,
  splitIntoChapters,
  type GeminiClient,
  type CharacterBible,
  type RawChapter,
} from "@illustrator/core";

import { upsertBible } from '../db/bible.db.js';
import { insertChapters } from '../db/chapter.db.js';
import type { makeSetStatus } from "./setStatus.js";

interface Ctx {
  readonly setStatus: ReturnType<typeof makeSetStatus>;
  readonly gemini: GeminiClient;
  readonly bookText: string;
  readonly bookId: string;
  readonly DB: D1Database;
}

export async function analyzeAndSplitStep({
  setStatus,
  gemini,
  bookText,
  bookId,
  DB,
}: Ctx): Promise<[CharacterBible, RawChapter[]]> {
  const log = getLogger();
  log.info('step.analyzeAndSplit.start', { bookId, bookChars: bookText.length });
  await setStatus("splitting");

  const [book, chapters] = await Promise.all([
    buildBible(gemini, bookText),
    splitIntoChapters(gemini, bookText),
  ]);

  await upsertBible(DB, bookId, book);
  await insertChapters(DB, bookId, chapters);

  log.info('step.analyzeAndSplit.complete', {
    bookId,
    chapterCount: chapters.length,
    primaryEntityCount: book.entities.filter((e) => e.importance === 'primary').length,
    totalEntityCount: book.entities.length,
  });

  return [book, chapters];
}
