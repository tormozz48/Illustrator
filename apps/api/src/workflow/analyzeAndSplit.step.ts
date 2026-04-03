import {
  buildBible,
  splitIntoChapters,
  type GeminiClient,
  type CharacterBible,
  type RawChapter,
} from "@illustrator/core";

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
  await setStatus("splitting");

  const [book, chapters] = await Promise.all([
    buildBible(gemini, bookText),
    splitIntoChapters(gemini, bookText),
  ]);

  await DB.prepare(
    `INSERT OR REPLACE INTO bibles (book_id, data, created_at)
     VALUES (?, ?, datetime('now'))`
  )
    .bind(bookId, JSON.stringify(book))
    .run();

  const statements = chapters.map((c) =>
    DB.prepare(
      `INSERT OR IGNORE INTO chapters (book_id, number, title, content, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(bookId, c.number, c.title ?? "", c.content)
  );
  if (statements.length > 0) await DB.batch(statements);

  return [book, chapters];
}
