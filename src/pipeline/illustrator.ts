import { Jimp } from 'jimp';
import pMap from 'p-map';
import type { GeminiClient } from '../gemini.js';
import type { CharacterBible, EnrichedChapter, KeyScene, RawChapter } from '../schemas.js';

const MAX_RETRIES = 2;
const PASS_THRESHOLD = 0.7;
const OUTPUT_WIDTH = 800;
const JPEG_QUALITY = 85;

function buildImagePrompt(
  scene: KeyScene,
  bible: CharacterBible,
  suggestions: string[] = []
): string {
  const { styleGuide, characters, settings } = bible;

  const presentChars = characters.filter((c) => scene.characters.includes(c.name));
  const charDescs = presentChars
    .map(
      (c) =>
        `${c.name}: ${c.age} ${c.gender} with ${c.hairColor} ${c.hairStyle} hair, ${c.eyeColor} eyes, ${c.skinTone} skin, ${c.facialFeatures}, wearing ${c.clothing}${c.accessories.length > 0 ? `, ${c.accessories.join(', ')}` : ''}${c.distinctiveFeatures.length > 0 ? `. Distinctive: ${c.distinctiveFeatures.join(', ')}` : ''}`
    )
    .join('\n');

  const setting = settings.find((s) => s.name === scene.setting);
  const settingDesc = setting ? setting.visualDescription : scene.setting;

  const parts = [
    styleGuide.stylePrefix,
    charDescs,
    scene.description,
    `Setting: ${settingDesc}`,
    `Mood: ${scene.mood}`,
  ].filter(Boolean);

  if (suggestions.length > 0) {
    parts.push(`IMPORTANT corrections for this attempt: ${suggestions.join('; ')}`);
  }

  parts.push(`Negative: ${styleGuide.negativePrompt}`);

  return parts.join('\n\n');
}

async function optimizeImage(
  imageBuffer: Buffer
): Promise<{ base64: string; width: number; height: number }> {
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

async function illustrateChapter(
  gemini: GeminiClient,
  chapter: RawChapter,
  bible: CharacterBible,
  anchorImages: Map<string, Buffer>,
  verbose: boolean
): Promise<EnrichedChapter> {
  const keyScene = await gemini.findKeyScene(chapter, bible);

  const refs = keyScene.characters
    .map((name) => anchorImages.get(name))
    .filter((buf): buf is Buffer => buf !== undefined);

  let bestImage: Buffer | null = null;
  let bestScore = 0;
  let suggestions: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = buildImagePrompt(keyScene, bible, attempt > 0 ? suggestions : []);

    if (verbose) {
      process.stderr.write(`  ch${chapter.number} attempt ${attempt + 1}/${MAX_RETRIES + 1}\n`);
    }

    let imageBuffer: Buffer;
    try {
      imageBuffer = await gemini.generateImage(prompt, refs);
    } catch (err) {
      if (verbose) {
        process.stderr.write(
          `  ch${chapter.number} image gen failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
      break;
    }

    let validation: Awaited<ReturnType<typeof gemini.validateImage>>;
    try {
      validation = await gemini.validateImage(imageBuffer, bible);
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

    if (validation.score >= PASS_THRESHOLD) break;

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
        prompt: buildImagePrompt(keyScene, bible),
        width: optimized.width,
        height: optimized.height,
        validationScore: bestScore,
      },
    };
  } catch {
    return { ...chapter, keyScene };
  }
}

export async function illustrateChapters(
  gemini: GeminiClient,
  chapters: RawChapter[],
  bible: CharacterBible,
  anchorImages: Map<string, Buffer>,
  concurrency: number,
  verbose: boolean,
  onProgress?: (completed: number, total: number) => void
): Promise<EnrichedChapter[]> {
  let completed = 0;
  const total = chapters.length;

  return pMap(
    chapters,
    async (chapter) => {
      const result = await illustrateChapter(gemini, chapter, bible, anchorImages, verbose);
      completed++;
      onProgress?.(completed, total);
      return result;
    },
    { concurrency }
  );
}
