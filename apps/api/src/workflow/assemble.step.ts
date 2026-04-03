import { assembleWebHtml, type CharacterBible } from "@illustrator/core";

import type { makeSetStatus } from "./setStatus.js";

interface Ctx {
  readonly setStatus: ReturnType<typeof makeSetStatus>;
  readonly bookId: string;
  readonly bible: CharacterBible;
  readonly DB: D1Database;
  readonly BOOKS_BUCKET: R2Bucket;
}

export async function assembleStep({
  setStatus,
  bookId,
  bible,
  DB,
  BOOKS_BUCKET,
}: Ctx): Promise<string> {
  await setStatus("assembling");

  const bookRow = await DB.prepare(
    `SELECT title, author FROM books WHERE id = ?`
  )
    .bind(bookId)
    .first<{ title: string; author: string | null }>();

  const { results: chRows } = await DB.prepare(
    `SELECT ch.number, ch.title, ch.content,
            an.insert_after_para,
            CASE WHEN il.chapter_id IS NOT NULL THEN 1 ELSE 0 END AS has_illustration
     FROM chapters ch
     LEFT JOIN anchors an ON an.chapter_id = ch.id
     LEFT JOIN illustrations il ON il.chapter_id = ch.id
     WHERE ch.book_id = ?
     ORDER BY ch.number`
  )
    .bind(bookId)
    .all<{
      number: number;
      title: string;
      content: string;
      insert_after_para: number | null;
      has_illustration: number;
    }>();

  const webChapters = chRows.map((row) => ({
    number: row.number,
    title: row.title,
    content: row.content,
    keyScene:
      row.insert_after_para !== null
        ? { insertAfterParagraph: row.insert_after_para }
        : null,
    hasIllustration: row.has_illustration === 1,
  }));

  const html = assembleWebHtml({
    bookId,
    title: bookRow?.title ?? "Untitled",
    author: bookRow?.author ?? undefined,
    bible,
    chapters: webChapters,
    generatedAt: new Date().toISOString(),
  });

  const key = `books/${bookId}/reader.html`;
  await BOOKS_BUCKET.put(key, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  return key;
}
