import {
  type CharacterBible,
  type GeminiClient,
  buildAnchorPrompt,
  getLogger,
} from '@illustrator/core';

type Entity = CharacterBible['entities'][number];

interface Ctx {
  readonly bookId: string;
  readonly entity: Entity;
  readonly bible: CharacterBible;
  readonly gemini: GeminiClient;
  readonly BOOKS_BUCKET: R2Bucket;
}

export async function anchorEntityStep({
  bookId,
  entity,
  bible,
  gemini,
  BOOKS_BUCKET,
}: Ctx): Promise<string | null> {
  const log = getLogger();
  log.info('step.anchor.start', { bookId, entity: entity.name });

  const prompt = buildAnchorPrompt({
    entity,
    stylePrefix: bible.styleGuide.stylePrefix,
    negativePrompt: bible.styleGuide.negativePrompt,
  });

  try {
    const imgBuf = await gemini.generateImage(prompt);
    const key = `books/${bookId}/anchors/${entity.name.replace(/\s+/g, '_')}.webp`;
    await BOOKS_BUCKET.put(key, imgBuf, {
      httpMetadata: { contentType: 'image/webp' },
    });
    log.info('step.anchor.complete', {
      bookId,
      entity: entity.name,
      r2Key: key,
      bytes: imgBuf.byteLength,
    });
    return key;
  } catch (err) {
    // Anchor generation is best-effort; don't fail the whole workflow
    const error = err instanceof Error ? err.message : String(err);
    log.warn('step.anchor.skip', { bookId, entity: entity.name, error });
    return null;
  }
}
