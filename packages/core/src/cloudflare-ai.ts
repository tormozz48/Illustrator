import { Jimp } from 'jimp';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AIProvider } from './ai-provider.js';
import { getLogger } from './logger.js';
import { analyzeBookPrompt } from './prompts/analyzeBook.js';
import { findKeySceneFallbackPrompt, findKeyScenePrompt } from './prompts/findKeyScene.js';
import { splitChaptersPrompt } from './prompts/splitChapters.js';
import { splitChaptersSkeletonPrompt } from './prompts/splitChaptersSkeleton.js';
import { validateImagePrompt } from './prompts/validateImage.js';
import { ChapterBoundaryResultSchema } from './schemas/chapters.js';
import {
  type CharacterBible,
  CharacterBibleSchema,
  type KeyScene,
  KeySceneSchema,
  type RawChapter,
  type ValidationResult,
  ValidationResultSchema,
} from './schemas/index.js';
import { callWithJsonRetry } from './utils/llmRetry.js';
import { sliceChapters } from './utils/sliceChapters.js';
import { estimateTruncationRisk } from './utils/truncationGuard.js';

// ── Model IDs ──────────────────────────────────────────────────────────────────
const TEXT_MODEL = '@cf/google/gemma-3-12b-it';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-2-dev';

// ── FLUX.2 Dev reference image constraints ────────────────────────────────────
/** FLUX.2 Dev requires reference images to be exactly this size (px) */
const REF_IMAGE_SIZE = 512;
/** FLUX.2 Dev accepts at most 4 reference images per request */
const MAX_REF_IMAGES = 4;
/** Hard prompt character limit for FLUX models */
const MAX_PROMPT_LENGTH = 2048;

// ── Workers AI input limits ───────────────────────────────────────────────────
// Workers AI hosted inference has a practical ~60 s HTTP timeout per call.
// Gemma 3 12B processes ~1 k tokens/s, so we cap input at ~16 k tokens (~48 k
// chars) to stay well under that limit for text calls.
//
// analyzeBook gets a slightly larger budget since character analysis benefits
// from seeing more of the book. Chapter splitting uses a skeleton for long
// texts so it can still scan the whole book without sending the full payload.

/** Max chars sent to Workers AI for book analysis (≈ 27 k tokens). */
const MAX_ANALYZE_CHARS = 80_000;

/**
 * Books shorter than this are sent in full to splitChapters.
 * Longer books use a compact skeleton instead.
 */
const SKELETON_THRESHOLD = 40_000;

/** Characters per window when building the chapter skeleton. */
const SKELETON_WINDOW = 2_500;

/** Characters shown from the start AND end of each skeleton window. */
const SKELETON_SNIP = 100;

// ── Workers AI binding type ────────────────────────────────────────────────────
// The `Ai` type is provided by @cloudflare/workers-types at runtime inside a
// Worker. We use an interface here so the core package has zero Cloudflare deps.
export interface CloudflareAiBinding {
  // biome-ignore lint/suspicious/noExplicitAny: Workers AI binding accepts arbitrary model inputs
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface CloudflareAIConfig {
  /**
   * Workers AI binding — pass `env.AI` from the Cloudflare Worker context.
   * Typed as a minimal interface so `@illustrator/core` stays Cloudflare-free.
   */
  ai: CloudflareAiBinding;
}

// ── Helper: extract text response from Workers AI result ─────────────────────
// Workers AI text models return either a plain string or `{ response: string }`.
function extractText(result: unknown): string | undefined {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'response' in result) {
    const r = (result as { response: unknown }).response;
    if (typeof r === 'string') return r;
  }
  return undefined;
}

// ── Helper: strip JSON Schema keywords unsupported by Outlines ───────────────
// Workers AI structured output uses Outlines (dottxt-ai) which does not
// accept:  $schema  •  additionalProperties
// We deep-clone and strip them before sending the schema to the binding.
function sanitizeForOutlines(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(sanitizeForOutlines);
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$schema' || k === 'additionalProperties') continue;
      out[k] = sanitizeForOutlines(v);
    }
    return out;
  }
  return node;
}

// ── Helper: build json_schema response_format for Workers AI ─────────────────
function jsonSchemaFormat(name: string, schema: ReturnType<typeof zodToJsonSchema>) {
  return {
    type: 'json_schema' as const,
    json_schema: { name, schema: sanitizeForOutlines(schema) },
  };
}

// ── Helper: truncate prompt to FLUX model limit ───────────────────────────────
function truncatePrompt(prompt: string, label: string): string {
  if (prompt.length <= MAX_PROMPT_LENGTH) return prompt;
  getLogger().warn(
    `${label}: prompt truncated from ${prompt.length} to ${MAX_PROMPT_LENGTH} chars`
  );
  return prompt.slice(0, MAX_PROMPT_LENGTH);
}

// ── CloudflareAIClient ────────────────────────────────────────────────────────

export class CloudflareAIClient implements AIProvider {
  private readonly ai: CloudflareAiBinding;

  constructor(config: CloudflareAIConfig) {
    this.ai = config.ai;
  }

  // ── Text generation ─────────────────────────────────────────────────────────

  async analyzeBook(text: string): Promise<CharacterBible> {
    const logger = getLogger();
    const risk = estimateTruncationRisk({ inputChars: text.length, expectedOutputSchema: 'bible' });
    if (risk !== 'low') {
      logger.warn(
        `analyzeBook: truncation risk is "${risk}" (input ${text.length.toLocaleString()} chars)`
      );
    }

    // Workers AI has a ~60 s inference timeout; cap input to avoid hanging.
    let safeText = text;
    if (text.length > MAX_ANALYZE_CHARS) {
      logger.warn(
        `analyzeBook: truncating input from ${text.length.toLocaleString()} to ${MAX_ANALYZE_CHARS.toLocaleString()} chars for Workers AI`
      );
      safeText = text.slice(0, MAX_ANALYZE_CHARS);
    }

    return callWithJsonRetry({
      call: async () => {
        const result = await this.ai.run(TEXT_MODEL, {
          messages: [{ role: 'user', content: analyzeBookPrompt(safeText) }],
          response_format: jsonSchemaFormat(
            'character_bible',
            zodToJsonSchema(CharacterBibleSchema)
          ),
        });
        return extractText(result);
      },
      schema: CharacterBibleSchema,
      label: 'analyzeBook',
    });
  }

  async splitChapters(text: string): Promise<RawChapter[]> {
    const logger = getLogger();
    const risk = estimateTruncationRisk({
      inputChars: text.length,
      expectedOutputSchema: 'chapters',
    });
    if (risk !== 'low') {
      logger.warn(
        `splitChapters: truncation risk is "${risk}" (input ${text.length.toLocaleString()} chars) — using boundary markers`
      );
    }

    // For long books use a compact skeleton so we don't hit the Workers AI
    // inference timeout.  The skeleton preserves the first + last ~100 chars of
    // every 2 500-char window, giving the model all chapter headings verbatim
    // at ~10% of the original payload size.
    const useSkeleton = text.length > SKELETON_THRESHOLD;
    if (useSkeleton) {
      logger.info(
        `splitChapters: text length ${text.length.toLocaleString()} > ${SKELETON_THRESHOLD.toLocaleString()} — using chapter skeleton`
      );
    }

    const prompt = useSkeleton
      ? splitChaptersSkeletonPrompt(buildChapterSkeleton(text), text.length)
      : splitChaptersPrompt(text);

    const boundaries = await callWithJsonRetry({
      call: async () => {
        const result = await this.ai.run(TEXT_MODEL, {
          messages: [{ role: 'user', content: prompt }],
          response_format: jsonSchemaFormat(
            'chapter_boundaries',
            zodToJsonSchema(ChapterBoundaryResultSchema)
          ),
        });
        return extractText(result);
      },
      schema: ChapterBoundaryResultSchema,
      label: useSkeleton ? 'splitChapters(skeleton)' : 'splitChapters',
    });

    return sliceChapters(text, boundaries.chapters);
  }

  async findKeyScene(chapter: RawChapter, bible: CharacterBible): Promise<KeyScene> {
    const logger = getLogger();
    let useFallback = false;

    return callWithJsonRetry({
      call: async () => {
        const prompt = useFallback
          ? findKeySceneFallbackPrompt(chapter, bible)
          : findKeyScenePrompt(chapter, bible);

        const result = await this.ai.run(TEXT_MODEL, {
          messages: [{ role: 'user', content: prompt }],
          response_format: jsonSchemaFormat('key_scene', zodToJsonSchema(KeySceneSchema)),
        });

        const responseText = extractText(result);
        if (!responseText) {
          logger.warn(
            `findKeyScene(ch${chapter.number}): empty response${useFallback ? ' (fallback prompt)' : ' — switching to fallback prompt'}`
          );
          useFallback = true;
        }
        return responseText;
      },
      schema: KeySceneSchema,
      label: `findKeyScene(ch${chapter.number})`,
    });
  }

  // ── Image generation ────────────────────────────────────────────────────────

  async generateImage(prompt: string, refs: Buffer[] = []): Promise<Buffer> {
    const logger = getLogger();

    // Truncate prompt to FLUX.2 Dev character limit
    const safePrompt = truncatePrompt(prompt, 'generateImage');

    // Resize and encode reference images (FLUX.2 Dev requires 512×512)
    const refArrays = await prepareReferenceImages(refs, logger);

    // Build input object — FLUX.2 Dev uses indexed keys: image_1, image_2, …
    const input: Record<string, unknown> = { prompt: safePrompt };
    for (let i = 0; i < refArrays.length; i++) {
      input[`image_${i + 1}`] = Array.from(refArrays[i]!);
    }

    logger.debug(
      `generateImage: calling FLUX.2 Dev with ${refArrays.length} ref(s), prompt length ${safePrompt.length}`
    );

    const result = await this.ai.run(IMAGE_MODEL, input);

    return bufferFromAiResult(result, 'generateImage');
  }

  // ── Image validation ────────────────────────────────────────────────────────

  async validateImage(image: Buffer, bible: CharacterBible): Promise<ValidationResult> {
    return callWithJsonRetry({
      call: async () => {
        const result = await this.ai.run(TEXT_MODEL, {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
                },
                { type: 'text', text: validateImagePrompt(bible) },
              ],
            },
          ],
          response_format: jsonSchemaFormat(
            'validation_result',
            zodToJsonSchema(ValidationResultSchema)
          ),
        });
        return extractText(result);
      },
      schema: ValidationResultSchema,
      label: 'validateImage',
    });
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Build a compact skeleton of the book text for chapter boundary detection.
 *
 * Divides the text into windows of SKELETON_WINDOW chars and records the first
 * and last SKELETON_SNIP characters of each window verbatim.  The resulting
 * skeleton is ~10% of the original length but retains every chapter heading
 * and every chapter-end sentence, which is all the model needs to return
 * accurate startMarker / endMarker values.
 */
function buildChapterSkeleton(text: string): string {
  const lines: string[] = [
    `Book skeleton — ${Math.ceil(text.length / SKELETON_WINDOW)} windows of ${SKELETON_WINDOW} chars each:`,
    '',
  ];

  for (let i = 0; i < text.length; i += SKELETON_WINDOW) {
    const windowEnd = Math.min(i + SKELETON_WINDOW, text.length);
    const windowNum = Math.floor(i / SKELETON_WINDOW) + 1;
    const startSnip = text.slice(i, i + SKELETON_SNIP).replace(/\r?\n/g, '↵');
    const endSnip = text.slice(Math.max(i, windowEnd - SKELETON_SNIP), windowEnd).replace(/\r?\n/g, '↵');

    lines.push(`[Window ${windowNum}, chars ${i}–${windowEnd}]`);
    lines.push(`  FIRST: ${startSnip}`);
    lines.push(`  LAST:  ${endSnip}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Resize reference images to 512×512 (FLUX.2 Dev requirement) and cap at
 * MAX_REF_IMAGES. Returns an array of Uint8Array PNG buffers ready for
 * the Workers AI binding input.
 */
async function prepareReferenceImages(
  refs: Buffer[],
  logger: ReturnType<typeof getLogger>
): Promise<Uint8Array[]> {
  if (refs.length === 0) return [];

  const capped = refs.slice(0, MAX_REF_IMAGES);
  if (refs.length > MAX_REF_IMAGES) {
    logger.warn(
      `generateImage: ${refs.length} refs provided; capped to ${MAX_REF_IMAGES} (FLUX.2 Dev limit)`
    );
  }

  return Promise.all(
    capped.map(async (ref) => {
      const img = await Jimp.read(ref);
      if (img.width !== REF_IMAGE_SIZE || img.height !== REF_IMAGE_SIZE) {
        img.resize({ w: REF_IMAGE_SIZE, h: REF_IMAGE_SIZE });
      }
      const pngBuf = await img.getBuffer('image/png');
      return new Uint8Array(pngBuf);
    })
  );
}

/**
 * Convert whatever Workers AI returns for image models into a Node Buffer.
 * The binding can return a ReadableStream, Uint8Array, ArrayBuffer, or
 * an object with an `image` field (some model variants).
 */
async function bufferFromAiResult(result: unknown, label: string): Promise<Buffer> {
  if (result instanceof ReadableStream) {
    const reader = result.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value instanceof Uint8Array) chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  if (result instanceof Uint8Array) {
    return Buffer.from(result);
  }
  if (result instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(result));
  }

  // Some model variants wrap the image in { image: base64string }
  if (result && typeof result === 'object' && 'image' in result) {
    const img = (result as { image: unknown }).image;
    if (typeof img === 'string') return Buffer.from(img, 'base64');
    if (img instanceof Uint8Array) return Buffer.from(img);
    if (img instanceof ArrayBuffer) return Buffer.from(new Uint8Array(img));
  }

  throw new Error(`${label}: unexpected Workers AI image result shape: ${typeof result}`);
}
