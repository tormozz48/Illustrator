import { Jimp } from 'jimp';
import { getBible } from '../db/bible.db.js';
import { getChapterFull, listChaptersForGrid, updateChapterStatus } from '../db/chapter.db.js';
import {
  type SceneRow,
  type VariantRow,
  getSceneById,
  getScenesByChapterId,
  getVariantById,
  getVariantsBySceneId,
  insertVariant,
  saveChapterSelections,
} from '../db/scene.db.js';
import { GeminiClient } from '../gemini.js';
import { getLogger } from '../logger.js';
import type { CharacterBible } from '../schemas/index.js';
import type { Env } from '../types.js';

export { listChaptersForGrid, getVariantById };

const OUTPUT_WIDTH = 800;

// ── Shared response shape ────────────────────────────────────────────────────

export interface SceneWithVariants {
  id: number;
  ordinal: number;
  description: string;
  visual_description: string;
  entities: string[];
  setting: string;
  mood: string;
  insert_after_para: number;
  selected: boolean;
  variants: Array<{
    id: number;
    image_url: string;
    validation_score: number | null;
    selected: boolean;
    created_at: string;
  }>;
}

export interface ChapterDetailResult {
  id: number;
  number: number;
  title: string | null;
  content: string;
  status: string;
  scenes: SceneWithVariants[];
}

async function buildScenesWithVariants({
  db,
  bookId,
  scenes,
}: {
  db: D1Database;
  bookId: string;
  scenes: SceneRow[];
}): Promise<SceneWithVariants[]> {
  return Promise.all(
    scenes.map(async (scene) => {
      const variants = await getVariantsBySceneId(db, scene.id);
      return {
        id: scene.id,
        ordinal: scene.ordinal,
        description: scene.description,
        visual_description: scene.visual_description,
        entities: JSON.parse(scene.entities || '[]') as string[],
        setting: scene.setting,
        mood: scene.mood,
        insert_after_para: scene.insert_after_para,
        selected: scene.selected === 1,
        variants: variants.map((v) => ({
          id: v.id,
          image_url: `/api/books/${bookId}/chapters/variants/${v.id}/img`,
          validation_score: v.validation_score,
          selected: v.selected === 1,
          created_at: v.created_at,
        })),
      };
    })
  );
}

// ── Exported service functions ───────────────────────────────────────────────

export async function getChapterDetail({
  db,
  bookId,
  num,
}: {
  db: D1Database;
  bookId: string;
  num: number;
}): Promise<ChapterDetailResult | null> {
  const chapter = await getChapterFull(db, bookId, num);
  if (!chapter) return null;

  const scenes = await getScenesByChapterId(db, chapter.id);
  const scenesWithVariants = await buildScenesWithVariants({
    db,
    bookId,
    scenes,
  });

  return {
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    content: chapter.content,
    status: chapter.status,
    scenes: scenesWithVariants,
  };
}

export interface GeneratedVariant {
  id: number;
  image_url: string;
  validation_score: number;
  selected: boolean;
  created_at: string;
}

export interface GeneratedSceneResult {
  scene_id: number;
  variants: GeneratedVariant[];
}

export type GenerateVariantsResult =
  | { kind: 'ok'; results: GeneratedSceneResult[] }
  | { kind: 'chapter_not_found' }
  | { kind: 'bible_not_found' };

export async function generateVariants({
  env,
  bookId,
  num,
  sceneIds,
  variantCount,
  onVariant,
  onSceneDone,
}: {
  env: Pick<Env, 'DB' | 'BOOKS_BUCKET' | 'GEMINI_API_KEY'>;
  bookId: string;
  num: number;
  sceneIds: number[];
  variantCount: number;
  onVariant?: (sceneId: number, variant: GeneratedVariant) => Promise<void>;
  onSceneDone?: (sceneId: number) => Promise<void>;
}): Promise<GenerateVariantsResult> {
  const chapter = await getChapterFull(env.DB, bookId, num);
  if (!chapter) return { kind: 'chapter_not_found' };

  const bibleRow = await getBible(env.DB, bookId);
  if (!bibleRow) return { kind: 'bible_not_found' };

  const bible: CharacterBible = JSON.parse(bibleRow.data);
  const client = new GeminiClient(env.GEMINI_API_KEY);
  const log = getLogger();
  const results: GeneratedSceneResult[] = [];

  for (const sceneId of sceneIds) {
    const scene = await getSceneById(env.DB, sceneId);

    if (!scene || scene.chapter_id !== chapter.id) {
      log.warn('generate.sceneNotFound', { bookId, sceneId });
      continue;
    }

    const sceneVariants: GeneratedVariant[] = [];

    for (let v = 0; v < variantCount; v++) {
      try {
        const prompt = buildImagePromptFromScene({ scene, bible });

        const refs: Buffer[] = [];
        const sceneEntityNames = JSON.parse(scene.entities || '[]') as string[];
        for (const entityName of sceneEntityNames) {
          const entity = bible.entities.find((e) => e.name === entityName);
          if (entity) {
            const anchorKey = `books/${bookId}/anchors/${entityName.replace(/\s+/g, '_')}.webp`;
            const obj = await env.BOOKS_BUCKET.get(anchorKey);
            if (obj) {
              const buf = await obj.arrayBuffer();
              refs.push(Buffer.from(buf));
            }
          }
        }

        const imageBuffer = await client.generateImage(prompt, refs);

        let validationScore = 0.5;
        // try {
        //   const validation = await client.validateImage(imageBuffer, bible);
        //   validationScore = validation.score;
        // } catch {
        //   // Skip validation on error
        // }

        const optimized = await optimizeImage(imageBuffer);

        const r2Key = `books/${bookId}/scenes/${sceneId}/v${v + 1}.webp`;
        await env.BOOKS_BUCKET.put(r2Key, Buffer.from(optimized.buffer), {
          httpMetadata: { contentType: 'image/webp' },
        });

        const variantId = await insertVariant(env.DB, {
          sceneId,
          r2Key,
          prompt,
          width: optimized.width,
          height: optimized.height,
          bytes: optimized.buffer.length,
          validationScore,
        });

        const generated: GeneratedVariant = {
          id: variantId,
          image_url: `/api/books/${bookId}/chapters/variants/${variantId}/img`,
          validation_score: validationScore,
          selected: false,
          created_at: new Date().toISOString(),
        };
        sceneVariants.push(generated);
        if (onVariant) await onVariant(sceneId, generated);
      } catch (err) {
        log.error('generate.variantFailed', {
          bookId,
          sceneId,
          variant: v + 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    results.push({ scene_id: sceneId, variants: sceneVariants });
    if (onSceneDone) await onSceneDone(sceneId);
  }

  return { kind: 'ok', results };
}

export async function saveChapter({
  env,
  bookId,
  num,
  selections,
}: {
  env: Pick<Env, 'DB'>;
  bookId: string;
  num: number;
  selections: Array<{ scene_id: number; variant_id: number | null }>;
}): Promise<ChapterDetailResult | null> {
  const chapter = await getChapterFull(env.DB, bookId, num);
  if (!chapter) return null;

  await saveChapterSelections(
    env.DB,
    chapter.id,
    selections.map((s) => ({ sceneId: s.scene_id, variantId: s.variant_id }))
  );
  await updateChapterStatus(env.DB, chapter.id, 'illustrated');

  const scenes = await getScenesByChapterId(env.DB, chapter.id);
  const scenesWithVariants = await buildScenesWithVariants({
    db: env.DB,
    bookId,
    scenes,
  });

  return {
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    content: chapter.content,
    status: 'illustrated',
    scenes: scenesWithVariants,
  };
}

export async function editChapter({
  env,
  bookId,
  num,
}: {
  env: Pick<Env, 'DB'>;
  bookId: string;
  num: number;
}): Promise<ChapterDetailResult | null> {
  const chapter = await getChapterFull(env.DB, bookId, num);
  if (!chapter) return null;

  await updateChapterStatus(env.DB, chapter.id, 'editing');

  const scenes = await getScenesByChapterId(env.DB, chapter.id);
  const scenesWithVariants = await buildScenesWithVariants({
    db: env.DB,
    bookId,
    scenes,
  });

  return {
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    content: chapter.content,
    status: 'editing',
    scenes: scenesWithVariants,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function buildImagePromptFromScene({
  scene,
  bible,
}: {
  scene: SceneRow;
  bible: CharacterBible;
}): string {
  const { styleGuide, entities, environments } = bible;
  const sceneEntities = JSON.parse(scene.entities || '[]') as string[];

  const presentEntities = entities.filter((e) => sceneEntities.includes(e.name));
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
    scene.visual_description,
    `Setting: ${settingDesc}`,
    `Mood: ${scene.mood}`,
  ].filter(Boolean) as string[];

  parts.push(`Negative: ${styleGuide.negativePrompt}`);

  return parts.join('\n\n');
}

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

interface OptimizedImage {
  buffer: Uint8Array;
  width: number;
  height: number;
}

async function optimizeImage(imageBuffer: Buffer): Promise<OptimizedImage> {
  const image = await Jimp.read(imageBuffer);

  if (image.width > OUTPUT_WIDTH) {
    image.resize({ w: OUTPUT_WIDTH });
  }

  const webpBuffer = await image.getBuffer('image/png');

  return {
    buffer: new Uint8Array(webpBuffer),
    width: image.width,
    height: image.height,
  };
}
