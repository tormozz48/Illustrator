import {
  type AIProvider,
  type CharacterBible,
  buildAnchorPrompt,
  getLogger,
} from '@illustrator/core';

type Entity = CharacterBible['entities'][number];

interface Ctx {
  readonly bookId: string;
  readonly entity: Entity;
  readonly bible: CharacterBible;
  readonly client: AIProvider;
  readonly BOOKS_BUCKET: R2Bucket;
}

export async function anchorEntityStep({
  bookId,
  entity,
  bible,
  client,
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
    const imgBuf = await client.generateImage(prompt);
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
    // Anchor generation is best-effort; don't fail the whole workflow.
    // Log at ERROR so the failure is always visible in Worker Logs.
    const error = err instanceof Error ? err.message : String(err);
    log.error('step.anchor.failed', { bookId, entity: entity.name, error });
    return null;
  }
}
