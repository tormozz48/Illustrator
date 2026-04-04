import {
  type AIProvider,
  type CharacterBible,
  type EnrichedChapter,
  type RawChapter,
  getLogger,
  illustrateChapter,
} from '@illustrator/core';

import { upsertAnchor } from '../db/anchor.db.js';
import { getChapterId } from '../db/chapter.db.js';
import { upsertIllustration } from '../db/illustration.db.js';

interface Ctx {
  readonly bookId: string;
  readonly chapters: RawChapter[];
  readonly bible: CharacterBible;
  readonly anchorImages: Map<string, Buffer>;
  readonly client: AIProvider;
  readonly DB: D1Database;
  readonly BOOKS_BUCKET: R2Bucket;
}

interface ChapterResult {
  chapterNumber: number;
  imgR2Key: string | null;
  error?: string;
}

/**
 * Process a batch of chapters concurrently within a single Workflow step.
 *
 * Uses Promise.allSettled so that one failing chapter doesn't abort the batch.
 * D1/R2 writes are idempotent (INSERT OR REPLACE), so retrying the whole
 * batch step is safe even if some chapters already succeeded.
 */
export async function illustrateBatchStep({
  bookId,
  chapters,
  bible,
  anchorImages,
  client,
  DB,
  BOOKS_BUCKET,
}: Ctx): Promise<ChapterResult[]> {
  const log = getLogger();
  log.info('step.batch.start', { bookId, chapters: chapters.map((c) => c.number) });

  const results = await Promise.allSettled(
    chapters.map((ch) =>
      illustrateSingleChapter({
        bookId,
        ch,
        bible,
        anchorImages,
        client,
        DB,
        BOOKS_BUCKET,
      })
    )
  );

  const mapped = results.map((result, i) => {
    // Safe: results.length === chapters.length (from Promise.allSettled)
    // biome-ignore lint/style/noNonNullAssertion: index always in bounds
    const ch = chapters[i]!;
    if (result.status === 'fulfilled') {
      return result.value;
    }
    const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
    log.error('step.batch.chapterFailed', { bookId, chapterNumber: ch.number, error: errMsg });
    return {
      chapterNumber: ch.number,
      imgR2Key: null,
      error: errMsg,
    };
  });

  const succeeded = mapped.filter((r) => r.imgR2Key !== null).length;
  const failed = mapped.filter((r) => r.imgR2Key === null).length;
  log.info('step.batch.complete', { bookId, total: chapters.length, succeeded, failed });

  return mapped;
}

// ── Single chapter processing ─────────────────────────────────────────────────

async function illustrateSingleChapter({
  bookId,
  ch,
  bible,
  anchorImages,
  client,
  DB,
  BOOKS_BUCKET,
}: {
  bookId: string;
  ch: RawChapter;
  bible: CharacterBible;
  anchorImages: Map<string, Buffer>;
  client: AIProvider;
  DB: D1Database;
  BOOKS_BUCKET: R2Bucket;
}): Promise<ChapterResult> {
  let enriched: EnrichedChapter;
  try {
    enriched = await illustrateChapter({
      client,
      chapter: ch,
      bible,
      anchorImages,
    });
  } catch {
    return { chapterNumber: ch.number, imgR2Key: null };
  }

  const chapterId = await getChapterId(DB, bookId, ch.number);
  if (chapterId === null) return { chapterNumber: ch.number, imgR2Key: null };

  await upsertAnchor(DB, chapterId, enriched.keyScene.insertAfterParagraph);

  if (!enriched.illustration) return { chapterNumber: ch.number, imgR2Key: null };

  const imgBuf = Buffer.from(enriched.illustration.imageBase64, 'base64');
  const imgR2Key = `books/${bookId}/chapters/${ch.number}/img.webp`;
  await BOOKS_BUCKET.put(imgR2Key, imgBuf, {
    httpMetadata: { contentType: 'image/webp' },
  });

  await upsertIllustration(DB, {
    chapterId,
    r2Key: imgR2Key,
    width: enriched.illustration.width,
    height: enriched.illustration.height,
    bytes: imgBuf.byteLength,
  });

  return { chapterNumber: ch.number, imgR2Key };
}
