import {
  type AIProvider,
  type CharacterBible,
  type EnrichedChapter,
  type RawChapter,
  illustrateChapter,
} from '@illustrator/core';

import { getChapterId } from '../db/chapter.db.js';
import { upsertAnchor } from '../db/anchor.db.js';
import { upsertIllustration } from '../db/illustration.db.js';

interface Ctx {
  readonly bookId: string;
  readonly ch: RawChapter;
  readonly bible: CharacterBible;
  readonly anchorImages: Map<string, Buffer>;
  readonly client: AIProvider;
  readonly DB: D1Database;
  readonly BOOKS_BUCKET: R2Bucket;
}

export async function illustrateChapterStep({
  bookId,
  ch,
  bible,
  anchorImages,
  client,
  DB,
  BOOKS_BUCKET,
}: Ctx): Promise<string | null> {
  let enriched: EnrichedChapter;
  try {
    enriched = await illustrateChapter({
      client,
      chapter: ch,
      bible,
      anchorImages,
    });
  } catch {
    // If illustration fails for a chapter, skip it gracefully
    return null;
  }

  const chapterId = await getChapterId(DB, bookId, ch.number);
  if (!chapterId) {
    return null;
  }

  await upsertAnchor(DB, chapterId, enriched.keyScene.insertAfterParagraph);

  if (!enriched.illustration) {
    return null;
  }

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

  return imgR2Key;
}
