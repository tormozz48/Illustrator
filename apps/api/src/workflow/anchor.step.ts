import type { AIProvider } from '../ai-provider.js';
import { getLogger } from '../logger.js';
import type { CharacterBible, VisualEntity } from '../schemas/index.js';

type Entity = VisualEntity;

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
    const error = err instanceof Error ? err.message : String(err);
    log.error('step.anchor.failed', { bookId, entity: entity.name, error });
    return null;
  }
}

// ── Anchor prompt ──────────────────────────────────────────────────────────────

function buildAnchorPrompt({
  entity,
  stylePrefix,
  negativePrompt,
}: {
  entity: VisualEntity;
  stylePrefix: string;
  negativePrompt: string;
}): string {
  const { name, category, visualDescription, distinctiveFeatures, physicalTraits } = entity;

  let subjectLine = `${name}: ${visualDescription}`;
  if (category === 'character' && physicalTraits) {
    const details = [
      physicalTraits.age,
      physicalTraits.gender,
      physicalTraits.hairColor &&
        `${`${physicalTraits.hairColor} ${physicalTraits.hairStyle ?? ''}`.trim()} hair`,
      physicalTraits.eyeColor && `${physicalTraits.eyeColor} eyes`,
      physicalTraits.skinTone && `${physicalTraits.skinTone} skin`,
      physicalTraits.facialFeatures,
      physicalTraits.clothing && `wearing ${physicalTraits.clothing}`,
      physicalTraits.accessories?.length ? physicalTraits.accessories.join(', ') : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    if (details) {
      subjectLine += ` — ${details}`;
    }
  }
  if (distinctiveFeatures.length > 0) {
    subjectLine += `. Distinctive: ${distinctiveFeatures.join(', ')}`;
  }

  const refInstruction =
    category === 'character'
      ? 'Full-body portrait, front-facing, neutral expression, neutral pose, plain background, character reference sheet.'
      : category === 'creature'
        ? 'Full-body side view, neutral pose, plain background, creature reference sheet.'
        : 'Detailed view of subject, isolated on plain background, reference sheet.';

  return [stylePrefix, subjectLine, refInstruction, `Negative: ${negativePrompt}`].join('\n\n');
}
