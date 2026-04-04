import { Jimp } from 'jimp';
import pMap from 'p-map';
import type { AIProvider } from '../ai-provider.js';
import { getLogger } from '../logger.js';
import type {
  CharacterBible,
  EnrichedChapter,
  KeyScene,
  RawChapter,
  VisualEntity,
} from '../schemas/index.js';

const MAX_RETRIES = 2;
const PASS_THRESHOLD = 0.7;
const OUTPUT_WIDTH = 800;
const JPEG_QUALITY = 85;

// ── Anchor prompt (exported so Workflow steps can call it directly) ────────────

export function buildAnchorPrompt({
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

// ── Image prompt builder (exported for Workflow steps) ────────────────────────

export function buildImagePrompt({
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

// ── Image optimisation (exported for apps that want to override it) ────────────

export interface OptimizedImage {
  base64: string;
  width: number;
  height: number;
}

export async function optimizeImage(imageBuffer: Buffer): Promise<OptimizedImage> {
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

// ── Chapter illustration ───────────────────────────────────────────────────────

export async function illustrateChapters({
  client,
  chapters,
  bible,
  anchorImages,
  concurrency,
  onProgress,
}: {
  client: AIProvider;
  chapters: RawChapter[];
  bible: CharacterBible;
  anchorImages: Map<string, Buffer>;
  concurrency: number;
  onProgress?: (completed: number, total: number) => void;
}): Promise<EnrichedChapter[]> {
  let completed = 0;
  const total = chapters.length;

  return pMap(
    chapters,
    async (chapter) => {
      const result = await illustrateChapter({ client, chapter, bible, anchorImages });
      completed++;
      onProgress?.(completed, total);
      return result;
    },
    { concurrency }
  );
}

/**
 * Illustrate a single chapter. Exported so Workflow steps can call this
 * for one chapter at a time without the pMap wrapper.
 */
export async function illustrateChapter({
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
