import {
  type CharacterBible,
  type EnrichedChapter,
  type GeminiClient,
  type RawChapter,
  illustrateChapter,
} from '@illustrator/core';

interface Ctx {
  readonly bookId: string;
  readonly chapters: RawChapter[];
  readonly bible: CharacterBible;
  readonly anchorImages: Map<string, Buffer>;
  readonly gemini: GeminiClient;
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
  gemini,
  DB,
  BOOKS_BUCKET,
}: Ctx): Promise<ChapterResult[]> {
  const results = await Promise.allSettled(
    chapters.map((ch) =>
      illustrateSingleChapter({
        bookId,
        ch,
        bible,
        anchorImages,
        gemini,
        DB,
        BOOKS_BUCKET,
      })
    )
  );

  return results.map((result, i) => {
    // Safe: results.length === chapters.length (from Promise.allSettled)
    // biome-ignore lint/style/noNonNullAssertion: index always in bounds
    const ch = chapters[i]!;
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Log but don't throw — the chapter is skipped, not fatal
    const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.error(`[batch] ch${ch.number} failed: ${errMsg}`);
    return {
      chapterNumber: ch.number,
      imgR2Key: null,
      error: errMsg,
    };
  });
}

// ── Single chapter processing (same logic as illustrateChapter.step.ts) ──────

async function illustrateSingleChapter({
  bookId,
  ch,
  bible,
  anchorImages,
  gemini,
  DB,
  BOOKS_BUCKET,
}: {
  bookId: string;
  ch: RawChapter;
  bible: CharacterBible;
  anchorImages: Map<string, Buffer>;
  gemini: GeminiClient;
  DB: D1Database;
  BOOKS_BUCKET: R2Bucket;
}): Promise<ChapterResult> {
  let enriched: EnrichedChapter;
  try {
    enriched = await illustrateChapter({
      client: gemini,
      chapter: ch,
      bible,
      anchorImages,
    });
  } catch {
    // If illustration fails for a chapter, skip it gracefully
    return { chapterNumber: ch.number, imgR2Key: null };
  }

  // Persist key-scene location to D1
  const chRow = await DB.prepare('SELECT id FROM chapters WHERE book_id = ? AND number = ?')
    .bind(bookId, ch.number)
    .first<{ id: number }>();

  if (!chRow) return { chapterNumber: ch.number, imgR2Key: null };

  await DB.prepare(
    `INSERT OR REPLACE INTO anchors (chapter_id, insert_after_para, created_at)
     VALUES (?, ?, datetime('now'))`
  )
    .bind(chRow.id, enriched.keyScene.insertAfterParagraph)
    .run();

  if (!enriched.illustration) return { chapterNumber: ch.number, imgR2Key: null };

  // Decode base64 and upload to R2
  const imgBuf = Buffer.from(enriched.illustration.imageBase64, 'base64');
  const imgR2Key = `books/${bookId}/chapters/${ch.number}/img.webp`;
  await BOOKS_BUCKET.put(imgR2Key, imgBuf, {
    httpMetadata: { contentType: 'image/webp' },
  });

  await DB.prepare(
    `INSERT OR REPLACE INTO illustrations
     (chapter_id, r2_key, width, height, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      chRow.id,
      imgR2Key,
      enriched.illustration.width,
      enriched.illustration.height,
      imgBuf.byteLength
    )
    .run();

  return { chapterNumber: ch.number, imgR2Key };
}
