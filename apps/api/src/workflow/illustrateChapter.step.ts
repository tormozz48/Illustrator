import {
  type CharacterBible,
  type EnrichedChapter,
  type GeminiClient,
  type RawChapter,
  illustrateChapter,
} from '@illustrator/core';

interface Ctx {
  readonly bookId: string;
  readonly ch: RawChapter;
  readonly bible: CharacterBible;
  readonly anchorImages: Map<string, Buffer>;
  readonly gemini: GeminiClient;
  readonly DB: D1Database;
  readonly BOOKS_BUCKET: R2Bucket;
}

export async function illustrateChapterStep({
  bookId,
  ch,
  bible,
  anchorImages,
  gemini,
  DB,
  BOOKS_BUCKET,
}: Ctx): Promise<string | null> {
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
    return null;
  }

  // Persist anchor (key-scene location) to D1
  const chRow = await DB.prepare('SELECT id FROM chapters WHERE book_id = ? AND number = ?')
    .bind(bookId, ch.number)
    .first<{ id: number }>();

  if (!chRow) return null;

  await DB.prepare(
    `INSERT OR REPLACE INTO anchors (chapter_id, insert_after_para, created_at)
     VALUES (?, ?, datetime('now'))`
  )
    .bind(chRow.id, enriched.keyScene.insertAfterParagraph)
    .run();

  if (!enriched.illustration) return null;

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

  return imgR2Key;
}
