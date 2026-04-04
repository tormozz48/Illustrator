import { type CharacterBible, assembleWebHtml, getLogger } from '@illustrator/core';

import { getBookMeta } from '../db/book.db.js';
import { listChaptersForAssemble } from '../db/chapter.db.js';
import type { makeSetStatus } from './setStatus.js';

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
  const log = getLogger();
  log.info('step.assemble.start', { bookId });
  await setStatus('assembling');

  const bookRow = await getBookMeta(DB, bookId);
  const chRows = await listChaptersForAssemble(DB, bookId);

  const webChapters = chRows.map((row) => ({
    number: row.number,
    title: row.title,
    content: row.content,
    keyScene:
      row.insert_after_para !== null ? { insertAfterParagraph: row.insert_after_para } : null,
    hasIllustration: row.has_illustration === 1,
  }));

  const html = assembleWebHtml({
    bookId,
    title: bookRow?.title ?? 'Untitled',
    author: bookRow?.author ?? undefined,
    bible,
    chapters: webChapters,
    generatedAt: new Date().toISOString(),
  });

  const key = `books/${bookId}/reader.html`;
  await BOOKS_BUCKET.put(key, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });

  log.info('step.assemble.complete', {
    bookId,
    r2Key: key,
    chapterCount: chRows.length,
    illustratedCount: chRows.filter((r) => r.has_illustration === 1).length,
    htmlChars: html.length,
  });

  return key;
}
