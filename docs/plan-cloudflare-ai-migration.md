# Implementation Plan: Cloudflare Workers AI Provider

**Companion to:** ADR-002
**Date:** 2026-04-04

## Overview

Add a `CloudflareAIClient` that uses Workers AI bindings (`env.AI.run()`) as an alternative to the existing `GeminiClient`. The API/workflow app switches to Cloudflare models; the CLI stays on Gemini.

**Models:** Gemma 3 12B (text + validation), FLUX.2 Dev (image generation with multi-reference support).
**Cost:** ~$0.19/book vs. ~$1.43/book on Gemini — 7.5× cheaper.

## Architecture

```
packages/core/
├── src/
│   ├── ai-provider.ts          ← NEW: AIProvider interface
│   ├── gemini.ts               ← MODIFY: implements AIProvider
│   ├── cloudflare-ai.ts        ← NEW: CloudflareAIClient implements AIProvider
│   ├── pipeline/
│   │   ├── analyzer.ts         ← MODIFY: GeminiClient → AIProvider
│   │   ├── splitter.ts         ← MODIFY: GeminiClient → AIProvider
│   │   └── illustrator.ts      ← MODIFY: GeminiClient → AIProvider
│   └── index.ts                ← MODIFY: export AIProvider + CloudflareAIClient

apps/api/
├── src/
│   ├── types.ts                ← MODIFY: add AI binding to Env
│   └── workflow/
│       └── index.ts            ← MODIFY: instantiate CloudflareAIClient
├── wrangler.jsonc              ← MODIFY: add [ai] binding
```

## Phases

### Phase 1: AIProvider Interface (core package)

**Goal:** Extract an interface from `GeminiClient` so pipeline stages are provider-agnostic.

#### Step 1.1: Define the interface

Create `packages/core/src/ai-provider.ts`:

```typescript
import type { CharacterBible, KeyScene, RawChapter, ValidationResult } from './schemas/index.js';

/**
 * Provider-agnostic AI client interface.
 *
 * Both GeminiClient and CloudflareAIClient implement this.
 * Pipeline stages depend only on this interface.
 */
export interface AIProvider {
  /** Full book text → structured Character Bible */
  analyzeBook(text: string): Promise<CharacterBible>;

  /** Full book text → chapter boundaries → sliced RawChapter[] */
  splitChapters(text: string): Promise<RawChapter[]>;

  /** Chapter + bible → key scene for illustration */
  findKeyScene(chapter: RawChapter, bible: CharacterBible): Promise<KeyScene>;

  /**
   * Generate an image from a text prompt with optional reference images.
   * @param prompt  Text description of the image
   * @param refs    Reference images for visual consistency (e.g. anchor portraits).
   *                Gemini accepts inline base64; FLUX.2 Dev accepts up to 4 × 512×512 images.
   */
  generateImage(prompt: string, refs?: Buffer[]): Promise<Buffer>;

  /** Score an image against the bible for visual consistency */
  validateImage(image: Buffer, bible: CharacterBible): Promise<ValidationResult>;
}
```

Key design choices:
- `refs` parameter stays **optional** (`refs?: Buffer[]`). Both Gemini and FLUX.2 Dev use them.
- The interface lives in core so both apps can import it.
- No Cloudflare-specific types leak into the interface.

#### Step 1.2: Refactor GeminiClient

Modify `packages/core/src/gemini.ts`:

```typescript
import type { AIProvider } from './ai-provider.js';

export class GeminiClient implements AIProvider {
  // ... existing implementation unchanged ...
  // generateImage signature already accepts refs: Buffer[] = []
  // Just add `implements AIProvider` to the class declaration
}
```

This is a zero-behavior-change refactor. The class already matches the interface.

#### Step 1.3: Update pipeline stage signatures

Change all pipeline files from:

```typescript
import type { GeminiClient } from '../gemini.js';

export async function buildBible(client: GeminiClient, text: string): Promise<CharacterBible> {
```

To:

```typescript
import type { AIProvider } from '../ai-provider.js';

export async function buildBible(client: AIProvider, text: string): Promise<CharacterBible> {
```

**Files to change:**
- `packages/core/src/pipeline/analyzer.ts` — `GeminiClient` → `AIProvider`
- `packages/core/src/pipeline/splitter.ts` — `GeminiClient` → `AIProvider`
- `packages/core/src/pipeline/illustrator.ts` — `GeminiClient` → `AIProvider` in `illustrateChapter()` and `illustrateChapters()`

#### Step 1.4: Update core exports

Add to `packages/core/src/index.ts`:

```typescript
export type { AIProvider } from './ai-provider.js';
export { CloudflareAIClient, type CloudflareAIConfig } from './cloudflare-ai.js';
```

---

### Phase 2: CloudflareAIClient Implementation

**Goal:** Implement the `AIProvider` interface using Cloudflare Workers AI models.

#### Step 2.1: Create CloudflareAIClient

Create `packages/core/src/cloudflare-ai.ts`:

```typescript
import { Jimp } from 'jimp';
import type { AIProvider } from './ai-provider.js';
import { getLogger } from './logger.js';
import { analyzeBookPrompt } from './prompts/analyzeBook.js';
import { findKeySceneFallbackPrompt, findKeyScenePrompt } from './prompts/findKeyScene.js';
import { splitChaptersPrompt } from './prompts/splitChapters.js';
import { validateImagePrompt } from './prompts/validateImage.js';
import { ChapterBoundaryResultSchema } from './schemas/chapters.js';
import {
  type CharacterBible, CharacterBibleSchema,
  type KeyScene, KeySceneSchema,
  type RawChapter, type ValidationResult, ValidationResultSchema,
} from './schemas/index.js';
import { callWithJsonRetry } from './utils/llmRetry.js';
import { sliceChapters } from './utils/sliceChapters.js';
import { estimateTruncationRisk } from './utils/truncationGuard.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const TEXT_MODEL = '@cf/google/gemma-3-12b-it';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-2-dev';
const REF_IMAGE_SIZE = 512; // FLUX.2 Dev requires 512×512 reference images
const MAX_REF_IMAGES = 4;   // FLUX.2 Dev supports up to 4 reference images

export interface CloudflareAIConfig {
  /** Workers AI binding — passed from env.AI in the Worker */
  ai: Ai;
}

export class CloudflareAIClient implements AIProvider {
  private readonly ai: Ai;

  constructor(config: CloudflareAIConfig) {
    this.ai = config.ai;
  }

  async analyzeBook(text: string): Promise<CharacterBible> {
    const logger = getLogger();
    const risk = estimateTruncationRisk({ inputChars: text.length, expectedOutputSchema: 'bible' });
    if (risk !== 'low') {
      logger.warn(`analyzeBook: truncation risk is "${risk}" (input ${text.length.toLocaleString()} chars)`);
    }

    return callWithJsonRetry({
      call: async () => {
        const result = await this.ai.run(TEXT_MODEL, {
          messages: [{ role: 'user', content: analyzeBookPrompt(text) }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'character_bible', schema: zodToJsonSchema(CharacterBibleSchema) },
          },
        });
        return typeof result === 'string' ? result : (result as { response?: string }).response;
      },
      schema: CharacterBibleSchema,
      label: 'analyzeBook',
    });
  }

  async splitChapters(text: string): Promise<RawChapter[]> {
    const logger = getLogger();
    const risk = estimateTruncationRisk({ inputChars: text.length, expectedOutputSchema: 'chapters' });
    if (risk !== 'low') {
      logger.warn(`splitChapters: truncation risk is "${risk}" (input ${text.length.toLocaleString()} chars)`);
    }

    const boundaries = await callWithJsonRetry({
      call: async () => {
        const result = await this.ai.run(TEXT_MODEL, {
          messages: [{ role: 'user', content: splitChaptersPrompt(text) }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'chapter_boundaries', schema: zodToJsonSchema(ChapterBoundaryResultSchema) },
          },
        });
        return typeof result === 'string' ? result : (result as { response?: string }).response;
      },
      schema: ChapterBoundaryResultSchema,
      label: 'splitChapters',
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
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'key_scene', schema: zodToJsonSchema(KeySceneSchema) },
          },
        });

        const text = typeof result === 'string' ? result : (result as { response?: string }).response;
        if (!text) {
          logger.warn(`findKeyScene(ch${chapter.number}): empty response${useFallback ? ' (fallback)' : ' — switching to fallback'}`);
          useFallback = true;
        }
        return text;
      },
      schema: KeySceneSchema,
      label: `findKeyScene(ch${chapter.number})`,
    });
  }

  async generateImage(prompt: string, refs: Buffer[] = []): Promise<Buffer> {
    // Resize reference images to 512×512 as required by FLUX.2 Dev
    const resizedRefs = await Promise.all(
      refs.slice(0, MAX_REF_IMAGES).map(async (ref) => {
        const image = await Jimp.read(ref);
        if (image.width !== REF_IMAGE_SIZE || image.height !== REF_IMAGE_SIZE) {
          image.resize({ w: REF_IMAGE_SIZE, h: REF_IMAGE_SIZE });
        }
        return await image.getBuffer('image/png');
      })
    );

    // FLUX.2 Dev accepts reference images via the AI binding
    const input: Record<string, unknown> = { prompt };
    for (let i = 0; i < resizedRefs.length; i++) {
      input[`image_${i + 1}`] = [...resizedRefs[i]!]; // Uint8Array-like
    }

    const result = await this.ai.run(IMAGE_MODEL, input);

    // Result is a ReadableStream or Uint8Array of image data
    if (result instanceof ReadableStream) {
      const reader = result.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    }

    return Buffer.from(result as Uint8Array);
  }

  async validateImage(image: Buffer, bible: CharacterBible): Promise<ValidationResult> {
    return callWithJsonRetry({
      call: async () => {
        const result = await this.ai.run(TEXT_MODEL, {
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } },
              { type: 'text', text: validateImagePrompt(bible) },
            ],
          }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'validation_result', schema: zodToJsonSchema(ValidationResultSchema) },
          },
        });
        return typeof result === 'string' ? result : (result as { response?: string }).response;
      },
      schema: ValidationResultSchema,
      label: 'validateImage',
    });
  }
}
```

#### Step 2.2: callWithJsonRetry compatibility

No changes needed. The existing `callWithJsonRetry` expects `call: () => Promise<string | null | undefined>`. The `CloudflareAIClient` methods extract the response string from the Workers AI result inside the closure (same pattern as `GeminiClient` extracting `result.text`).

#### Step 2.3: Add zod-to-json-schema dependency

Workers AI JSON mode uses JSON Schema (not Zod directly). Add `zod-to-json-schema` to convert existing Zod schemas:

```bash
cd packages/core && npm install zod-to-json-schema
```

---

### Phase 3: Workers AI Binding in API App

**Goal:** Wire up the Workers AI binding and switch the workflow to use `CloudflareAIClient`.

#### Step 3.1: Add AI binding to wrangler.jsonc

```jsonc
{
  // ... existing config ...

  // ── AI binding ──────────────────────────────────────────────────────────────
  "ai": {
    "binding": "AI"
  }
}
```

#### Step 3.2: Update Env type

In `apps/api/src/types.ts`:

```typescript
export interface Env {
  // ... existing bindings ...

  // Workers AI
  AI: Ai;

  // Secrets — GEMINI_API_KEY no longer needed for production
  // Keep it for fallback/testing if desired
  GEMINI_API_KEY?: string;
}
```

#### Step 3.3: Update workflow to use CloudflareAIClient

In `apps/api/src/workflow/index.ts`:

```typescript
import { CloudflareAIClient, getLogger, setLogger } from '@illustrator/core';

export class IllustrateBookWorkflow extends WorkflowEntrypoint<Env, IllustrateJobMessage> {
  async run(event: WorkflowEvent<IllustrateJobMessage>, step: WorkflowStep) {
    const { bookId, r2Key } = event.payload;
    const { DB, BOOKS_BUCKET, CACHE, AI } = this.env;

    const client = new CloudflareAIClient({ ai: AI });
    // ... rest unchanged, `client` replaces `gemini` everywhere ...
  }
}
```

#### Step 3.4: Update workflow step files

All step files that accept `gemini: GeminiClient` need updating:

- `analyzeAndSplit.step.ts` — param type `GeminiClient` → `AIProvider`, name `gemini` → `client`
- `anchor.step.ts` — same
- `illustrateBatch.step.ts` — same
- `illustrateChapter.step.ts` — same

These are type-only changes — the method calls (`client.analyzeBook()`, `client.generateImage()`, etc.) are identical.

#### Step 3.5: Increase CHAPTER_CONCURRENCY

Since Workers AI binding calls don't count as external subrequests:

```typescript
// Old (constrained by 50 external subrequest limit for Gemini API calls):
const CHAPTER_CONCURRENCY = 3;

// New (AI calls via binding are internal, only D1/R2 count as external):
const CHAPTER_CONCURRENCY = 5;
```

This alone reduces wall-clock time by ~40% for a 20-chapter book (from ~7 batch steps to ~4).

---

### Phase 4: Reference Image Adaptation

**Goal:** Ensure FLUX.2 Dev reference images work correctly via the Workers AI binding.

#### Step 4.1: Reference image resizing

FLUX.2 Dev requires reference images to be exactly 512×512. The `CloudflareAIClient.generateImage()` method handles this internally via Jimp (already a dependency). Anchor images generated by the pipeline are typically larger, so the resize is necessary.

The resize happens inside `generateImage()` — transparent to the pipeline. No changes needed to `illustrator.ts` or any step files.

#### Step 4.2: Reference image limit

FLUX.2 Dev supports a maximum of 4 reference images. The current pipeline passes all anchor images for entities mentioned in a scene. For scenes with 5+ entities, the `generateImage()` method takes the first 4 and drops the rest. This is handled internally — the interface contract doesn't change.

If needed later, a priority-based selection (primary entities first, then secondary) can be added to `illustrateChapter()`.

#### Step 4.3: Verify prompt compatibility

FLUX.2 Dev has a prompt limit (likely 2048+ chars). The existing prompts from `buildImagePrompt()` should fit, but add a warning log if a prompt is truncated:

```typescript
const MAX_PROMPT_LENGTH = 2048;
if (prompt.length > MAX_PROMPT_LENGTH) {
  logger.warn(`Prompt truncated from ${prompt.length} to ${MAX_PROMPT_LENGTH} chars`);
  prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
}
```

---

### Phase 5: Testing & Validation

#### Step 5.1: Unit tests for AIProvider implementations

- Test that `GeminiClient` still passes existing tests (regression)
- Test `CloudflareAIClient` with mocked `Ai` binding
- Test that `callWithJsonRetry` works with both providers
- Test reference image resizing to 512×512

#### Step 5.2: Integration test with Russian book

Run the full pipeline with a Russian-language book through Cloudflare models:
- Verify Gemma 3 12B produces valid CharacterBible with Cyrillic entity names preserved
- Verify chapter splitting works correctly on non-Latin text
- Verify FLUX.2 Dev generates reasonable images with anchor references

#### Step 5.3: Image quality comparison

Generate the same book with both providers and compare:
- Visual consistency across chapters (with reference images on both)
- Art style adherence to styleGuide
- Entity recognizability and anchor fidelity

#### Step 5.4: Cost monitoring

Add neuron tracking to `CloudflareAIClient`:

```typescript
export class CloudflareAIClient implements AIProvider {
  private neuronsUsed = 0;

  getNeuronsUsed(): number { return this.neuronsUsed; }

  // After each ai.run() call, log operation type + estimated neurons
  // Aggregate at book level for operational visibility
}
```

---

## Implementation Order & Dependencies

```
Phase 1 (no breaking changes, pure refactor):
  1.1 Define AIProvider interface
  1.2 GeminiClient implements AIProvider
  1.3 Pipeline stages use AIProvider
  1.4 Update exports
  ↓
Phase 2 (new code, no production impact):
  2.1 CloudflareAIClient implementation (text + image + validation)
  2.2 Verify callWithJsonRetry compatibility
  2.3 npm install zod-to-json-schema
  ↓
Phase 3 (production switch):
  3.1 Add AI binding to wrangler.jsonc
  3.2 Update Env type
  3.3 Switch workflow to CloudflareAIClient
  3.4 Update step file types (gemini → client, GeminiClient → AIProvider)
  3.5 Increase CHAPTER_CONCURRENCY to 5
  ↓
Phase 4 (quality tuning, can overlap with Phase 3):
  4.1 Verify ref image resize works correctly
  4.2 Verify 4-ref limit handling
  4.3 Add prompt length warning/truncation
  ↓
Phase 5 (validation):
  5.1 Unit tests
  5.2 Russian book integration test
  5.3 Image quality comparison (Gemini vs Cloudflare)
  5.4 Cost monitoring
```

## Rollback Plan

If Cloudflare model quality is unacceptable:

1. **Quick rollback:** Change workflow back to `GeminiClient` — one-line change in `workflow/index.ts`. The `AIProvider` interface means the pipeline works with either provider.
2. **Model swap:** Change `TEXT_MODEL` or `IMAGE_MODEL` constants in `cloudflare-ai.ts`:
   - Text: `@cf/mistral/mistral-small-3.1-24b-instruct` (~2× neuron cost, better multilingual)
   - Image: `@cf/black-forest-labs/flux-1-schnell` (fast tier, ~$0.001/image, but no refs)
3. **Hybrid:** Compose two providers — Cloudflare for text (cheap), Gemini for images (quality). The `AIProvider` interface doesn't prevent this; you'd create a `HybridAIClient` that delegates each method to the appropriate backend.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemma 3 12B produces invalid JSON for complex schemas | Medium | High | callWithJsonRetry handles retries; fallback to Mistral Small 3.1 |
| FLUX.2 Dev image quality differs from Gemini | Medium | Medium | Both support refs — compare side by side; adjust steps parameter |
| FLUX.2 Dev ref images (512×512) lose detail vs Gemini (arbitrary size) | Low | Low | Anchor images already use simple poses on plain backgrounds — 512px is sufficient |
| Gemma 3 12B weak on Russian literary analysis | Low-Medium | High | Switch to Mistral Small 3.1 (24B, strong multilingual); test early in Phase 5.2 |
| Workers AI binding API changes | Low | Medium | Abstracted behind CloudflareAIClient — only one file to update |
| Cloudflare pricing changes (neuron → units) | Medium | Low | Cost monitoring (Phase 5.4) provides early warning |
| Prompt exceeds FLUX.2 Dev limit | Low | Low | Truncation guard (Phase 4.3); existing prompts are typically <1500 chars |
