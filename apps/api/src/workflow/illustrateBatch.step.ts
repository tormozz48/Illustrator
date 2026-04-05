import { Jimp } from 'jimp';
import type { AIProvider } from '../ai-provider.js';
import { upsertAnchor } from '../db/anchor.db.js';
import { getChapterId } from '../db/chapter.db.js';
import { upsertIllustration } from '../db/illustration.db.js';
import { getLogger } from '../logger.js';
import type { CharacterBible, EnrichedChapter, KeyScene, RawChapter } from '../schemas/index.js';

const MAX_RETRIES = 2;
const PASS_THRESHOLD = 0.7;
const OUTPUT_WIDTH = 800;
const JPEG_QUALITY = 85;

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
  if (chapterId === null) {
    return { chapterNumber: ch.number, imgR2Key: null };
  }

  await upsertAnchor(DB, chapterId, enriched.keyScene.insertAfterParagraph);

  if (!enriched.illustration) {
    return { chapterNumber: ch.number, imgR2Key: null };
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

  return { chapterNumber: ch.number, imgR2Key };
}

// ── Chapter illustration ───────────────────────────────────────────────────────

async function illustrateChapter({
  client,
  chapter,
  bible,
  anchorImages,
}: {
  client: AIProvider;
  chapter: RawChapter;
  bible: CharacterBible;
  anchorImages: Map<string, Buffer>;
}): Promise<EnrichedChapter> {
  const logger = getLogger();
  const keyScene = await client.findKeyScene(chapter, bible);

  const refs = keyScene.entities
    .map((name) => anchorImages.get(name))
    .filter((buf): buf is Buffer => buf !== undefined);

  let bestImage: Buffer | null = null;
  let bestScore = 0;
  let suggestions: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = buildImagePrompt({
      scene: keyScene,
      bible,
      suggestions: attempt > 0 ? suggestions : [],
    });

    logger.debug(`ch${chapter.number} attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

    let imageBuffer: Buffer;
    try {
      imageBuffer = await client.generateImage(prompt, refs);
    } catch (err) {
      logger.error(
        `ch${chapter.number} image gen failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`
      );
      break;
    }

    let validation: Awaited<ReturnType<typeof client.validateImage>>;
    try {
      validation = await client.validateImage(imageBuffer, bible);
    } catch {
      // Validation failure — accept the image as-is
      bestImage = imageBuffer;
      bestScore = 0.5;
      break;
    }

    if (bestImage === null || validation.score > bestScore) {
      bestImage = imageBuffer;
      bestScore = validation.score;
    }

    if (validation.score >= PASS_THRESHOLD) {
      break;
    }

    suggestions = validation.suggestions ?? [];
  }

  if (bestImage === null) {
    return { ...chapter, keyScene };
  }

  try {
    const optimized = await optimizeImage(bestImage);
    return {
      ...chapter,
      keyScene,
      illustration: {
        imageBase64: optimized.base64,
        prompt: buildImagePrompt({ scene: keyScene, bible }),
        width: optimized.width,
        height: optimized.height,
        validationScore: bestScore,
      },
    };
  } catch {
    return { ...chapter, keyScene };
  }
}

// ── Image prompt builder ───────────────────────────────────────────────────────

function buildImagePrompt({
  scene,
  bible,
  suggestions = [],
}: {
  scene: KeyScene;
  bible: CharacterBible;
  suggestions?: string[];
}): string {
  const { styleGuide, entities, environments } = bible;

  const presentEntities = entities.filter((e) => scene.entities.includes(e.name));
  const entityDescs = presentEntities.map(buildEntityDescription).join('\n');

  const environment = environments.find((env) => env.name === scene.setting);
  const settingDesc = environment
    ? `${environment.visualDescription} Atmosphere: ${environment.atmosphere}. ${
        environment.recurringElements.length > 0
          ? `Always present: ${environment.recurringElements.join(', ')}.`
          : ''
      }`
    : scene.setting;

  const parts = [
    styleGuide.stylePrefix,
    entityDescs || undefined,
    scene.description,
    `Setting: ${settingDesc}`,
    `Mood: ${scene.mood}`,
  ].filter(Boolean) as string[];

  if (suggestions.length > 0) {
    parts.push(`IMPORTANT corrections for this attempt: ${suggestions.join('; ')}`);
  }

  parts.push(`Negative: ${styleGuide.negativePrompt}`);

  return parts.join('\n\n');
}

// ── Image optimisation ─────────────────────────────────────────────────────────

interface OptimizedImage {
  base64: string;
  width: number;
  height: number;
}

async function optimizeImage(imageBuffer: Buffer): Promise<OptimizedImage> {
  const image = await Jimp.read(imageBuffer);

  if (image.width > OUTPUT_WIDTH) {
    image.resize({ w: OUTPUT_WIDTH });
  }

  const jpegBuffer = await image.getBuffer('image/jpeg', { quality: JPEG_QUALITY });

  return {
    base64: jpegBuffer.toString('base64'),
    width: image.width,
    height: image.height,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildEntityDescription(entity: CharacterBible['entities'][number]): string {
  const { name, visualDescription, physicalTraits, distinctiveFeatures, category } = entity;

  let desc = `${name}: ${visualDescription}`;
  if (category === 'character' && physicalTraits) {
    const inline = [
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
    if (inline) {
      desc += ` — ${inline}`;
    }
  }
  if (distinctiveFeatures.length > 0) {
    desc += `. Distinctive: ${distinctiveFeatures.join(', ')}`;
  }
  return desc;
}
