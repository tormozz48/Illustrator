# ADR-002: Cloudflare Workers AI as Web/API AI Provider

**Status:** Proposed
**Date:** 2026-04-04
**Deciders:** Andrii

## Context

The Illustrator pipeline currently uses Google Gemini API (`@google/genai`) for all AI operations — text generation (structured JSON), image generation, and multimodal image validation. A single `GeminiClient` class in `packages/core/src/gemini.ts` encapsulates all five call types:

1. **analyzeBook** — full book text → structured Character Bible (JSON)
2. **splitChapters** — full book text → chapter boundary markers (JSON)
3. **findKeyScene** — chapter + bible → scene description (JSON)
4. **generateImage** — text prompt + reference image buffers → PNG
5. **validateImage** — image + bible → consistency score (multimodal → JSON)

The system runs in two modes: a **CLI** (`apps/cli`) for local development, and a **Cloudflare Workers API** (`apps/api`) with Workflows for the SaaS product. Both import `GeminiClient` from `@illustrator/core`.

### Goal

Use Cloudflare Workers AI models in the web/API path to **dramatically reduce** AI inference costs for the SaaS product (from ~$0.975/book on Gemini to ~$0.16/book on Cloudflare paid tier), while keeping the CLI on Gemini for development flexibility and higher quality.

### Forces

1. **Cost:** Gemini API image generation costs ~$0.039/image (standard) or ~$0.020/image (batch). Cloudflare Workers AI FLUX.2 Dev costs ~$0.005/image — a 4–8× reduction on the dominant pipeline cost.
2. **Multilingual:** Books are processed in many languages including Russian, Ukrainian, German, French, Japanese, etc. Models must handle non-Latin scripts well.
3. **Structured output:** The pipeline depends on JSON schema validation (Zod). Models must support `response_format: json_schema`.
4. **Image consistency:** The anchor-based strategy (generate reference portraits, pass them to subsequent image generation calls) is core to visual consistency. FLUX.2 Dev supports up to 4 reference images via multipart form-data — preserving this strategy.
5. **Latency is secondary:** Processing is async (Cloudflare Workflows). Users don't wait synchronously.
6. **Workers AI binding:** Inside a Cloudflare Worker, `env.AI.run()` calls do NOT count as external subrequests (the 50/step limit from ADR-001). This is a major advantage — AI calls become effectively free of subrequest constraints.

## Decision

**Introduce an `AIProvider` interface in `@illustrator/core` with two implementations: `GeminiClient` (existing, refactored) and `CloudflareAIClient` (new). The web/API app uses `CloudflareAIClient` via Workers AI bindings. The CLI continues using `GeminiClient`.**

### Model Selection

| Call Type | Cloudflare Model | Cost/call | Rationale |
|-----------|-----------------|-----------|-----------|
| **Text generation** (analyzeBook, splitChapters, findKeyScene) | `@cf/google/gemma-3-12b-it` | ~$0.0003–0.0008 | 128K context, 140+ languages (incl. Russian), JSON schema support, best neuron efficiency at 12B params |
| **Image validation** (validateImage) | `@cf/google/gemma-3-12b-it` | ~$0.0007 | Multimodal (image+text→JSON), same model reduces complexity, adequate vision quality for scoring |
| **Image generation** (generateImage) | `@cf/black-forest-labs/flux-2-dev` | ~$0.005 | Standard tier, supports up to 4 multi-reference images (512×512) via multipart form-data. Preserves anchor-based consistency strategy unchanged |

### Why Gemma 3 12B for text + validation

- **Context window:** 128K tokens — sufficient for full book text (largest books ~500K chars ≈ ~125K tokens)
- **Multilingual:** Trained on 140+ languages. Google's Gemma family has strong Cyrillic, CJK, and Arabic script performance
- **JSON schema:** Workers AI supports `response_format: { type: "json_schema", json_schema: {...} }` compatible with OpenAI structured outputs API
- **Multimodal:** Handles image + text input for `validateImage`
- **Neuron cost:** 12B params is the sweet spot — significantly cheaper than Mistral Small 3.1 (24B) while still capable for structured extraction

### Why FLUX.2 Dev for image generation

- **Multi-reference support:** Up to 4 reference images (512×512 each) via multipart form-data. This directly preserves the existing anchor-based consistency strategy — anchor portraits are generated once per primary entity and passed as references to all chapter illustration calls
- **Cost:** ~$0.005/image at 1024×1024 (~455 neurons). 8× cheaper than Gemini 2.5 Flash ($0.039) and 4× cheaper than Gemini batch ($0.020). On third-party platforms the same model costs $0.012–0.025/image — the Cloudflare-hosted version is the cheapest available
- **Quality:** Full 32B parameter model with adjustable inference steps (up to 25–30). High-fidelity, photorealistic and artistic output
- **Resolution:** Up to 4 megapixels output (e.g. 2048×2048 or 1920×1080)
- **Architecture alignment:** Since FLUX.2 Dev supports reference images, the `generateImage(prompt, refs)` contract is preserved identically between `GeminiClient` and `CloudflareAIClient` — no prompt reworking, no anchor strategy changes, minimal pipeline modifications

### Anchor strategy preserved

The pipeline's consistency strategy remains unchanged:

1. Generate anchor portraits for each primary entity (full-body, neutral pose)
2. Store anchors in R2
3. Load anchor images as `Buffer[]` before chapter illustration
4. Pass relevant anchors as `refs` to `generateImage()` for each chapter
5. Validate generated image against bible for consistency scoring

The only adaptation needed is encoding: Gemini accepts inline base64 data, while FLUX.2 Dev on Workers AI accepts references via the AI binding API. The `CloudflareAIClient.generateImage()` method handles this translation internally.

**Reference image constraint:** FLUX.2 Dev requires reference images to be 512×512. The pipeline already optimizes images via Jimp — adding a resize-to-512 step before passing refs is trivial.

## Options Considered

### Option A: FLUX.2 Dev with reference images (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — new abstraction layer + CloudflareAIClient, but pipeline logic nearly unchanged |
| Cost | ~$0.16/book (paid tier). ~0.7 books/day on free tier (10K neurons) |
| Quality risk | Low-Medium — reference images preserve consistency; Gemma 3 12B is the main unknown |
| Throughput | High — no practical limit on paid tier |
| Team familiarity | Good — same TypeScript, same pipeline logic, same Zod schemas |

**Pros:**
- ~$0.16/book vs. ~$0.975/book on Gemini — 6× cost reduction
- Anchor-based consistency strategy preserved unchanged
- `generateImage(prompt, refs)` contract identical between providers — minimal pipeline changes
- Workers AI binding eliminates external subrequest limits (can increase CHAPTER_CONCURRENCY)
- Provider abstraction future-proofs model swaps
- Cloudflare-native: models on same edge as Workers, D1, R2
- Cheapest available FLUX.2 Dev hosting ($0.005 vs. $0.012–0.025 on fal.ai/Together)

**Cons:**
- Two provider implementations to maintain
- Gemma 3 12B may produce lower-quality structured output than Gemini 2.5 Flash
- Reference images must be resized to 512×512 (max 4 refs)
- Standard-tier model is slower than fast-tier alternatives (~25 steps vs. 4)

### Option B: FLUX.2 Klein 4B — fast tier, no references

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — same abstraction, but requires prompt rework for consistency without refs |
| Cost | ~$0.06/book (3× cheaper than Option A) |
| Quality risk | High — no reference images, consistency depends entirely on prompt quality |
| Throughput | Very high — sub-second image generation |

**Pros:**
- 3× cheaper per book than FLUX.2 Dev
- Ultra-fast generation (4 fixed steps)

**Cons:**
- No reference image support — anchor strategy must be abandoned or reworked
- Visual consistency relies on text prompts alone — significant quality risk
- Prompt length limit (2048 chars) may be restrictive with full entity descriptions
- Requires reworking buildImagePrompt, making anchor generation optional, adding prompt truncation

### Option C: Full dual-provider in core package

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — both CLI and API need provider config, REST API fallback for CLI |
| Cost | Same as A for SaaS; CLI gains option for Cloudflare |
| Throughput | Same |

**Pros:**
- CLI can test with Cloudflare models without Gemini key

**Cons:**
- Overengineered — CLI works fine with Gemini
- REST API from CLI doesn't get binding benefits, adds latency

## Trade-off Analysis

The core trade-off is **cost per book vs. implementation simplicity**.

Option A (FLUX.2 Dev, $0.005/image with references) costs ~$0.16/book — 2.6× more than Option B (Klein 4B, $0.001/image without references at ~$0.06/book). However, Option A preserves the anchor-based consistency strategy unchanged, requiring almost no pipeline modifications. Option B would save ~$0.10/book but requires significant prompt engineering rework and accepts higher quality risk.

At 1,000 books/month: Option A = ~$160/month, Option B = ~$60/month, Gemini = ~$975/month. The $100/month difference between A and B is small relative to the 6× savings over Gemini, and the preserved architecture simplicity of Option A makes it the clear winner.

The Workers AI binding advantage is significant regardless of image model choice: AI calls inside a Worker bypass the 50-external-subrequest limit. `CHAPTER_CONCURRENCY` in ADR-001 can increase from 3 to 5+ since AI calls are no longer external requests.

## Cost Comparison (20-chapter book)

### Cloudflare Workers AI — FLUX.2 Dev (chosen)

| Operation | Calls | Neurons/call | Total neurons | Cost |
|-----------|-------|-------------|---------------|------|
| analyzeBook (Gemma 3 12B) | 1 | ~300 | 300 | $0.003 |
| splitChapters (Gemma 3 12B) | 1 | ~200 | 200 | $0.002 |
| findKeyScene (Gemma 3 12B) | 20 | ~50 | 1,000 | $0.011 |
| generateImage — anchors (FLUX.2 Dev) | 5 | ~455 | 2,275 | $0.025 |
| generateImage — chapters (FLUX.2 Dev) | 20 | ~455 | 9,100 | $0.100 |
| validateImage (Gemma 3 12B) | 20 | ~60 | 1,200 | $0.013 |
| Retry images ~30% (FLUX.2 Dev) | 6 | ~455 | 2,730 | $0.030 |
| **Total** | | | **~16,805** | **~$0.185** |

### Gemini 2.5 Flash (current)

| Operation | Calls | Cost/call | Total cost |
|-----------|-------|-----------|------------|
| analyzeBook | 1 | ~$0.01 | $0.01 |
| splitChapters | 1 | ~$0.01 | $0.01 |
| findKeyScene | 20 | ~$0.005 | $0.10 |
| generateImage — anchors | 5 | ~$0.039 | $0.195 |
| generateImage — chapters | 20 | ~$0.039 | $0.780 |
| validateImage | 20 | ~$0.005 | $0.10 |
| Retry images ~30% | 6 | ~$0.039 | $0.234 |
| **Total** | | | **~$1.43** |

### Summary

| Provider | Cost/book | 100 books/mo | 1,000 books/mo | vs. Gemini |
|----------|-----------|-------------|----------------|------------|
| **Cloudflare (FLUX.2 Dev)** | **~$0.19** | **~$19** | **~$185** | **7.5× cheaper** |
| Gemini 2.5 Flash | ~$1.43 | ~$143 | ~$1,430 | baseline |
| Gemini batch (50% off) | ~$0.78 | ~$78 | ~$780 | 1.8× cheaper |

## Consequences

- **What becomes easier:** SaaS AI costs drop to ~$0.19/book (7.5× cheaper than Gemini). Workers AI binding removes the subrequest bottleneck for parallel chapter processing. Provider abstraction makes future model swaps trivial. Anchor-based consistency strategy preserved — no prompt rework needed.
- **What becomes harder:** Two provider implementations to maintain and test. FLUX.2 Dev reference images must be 512×512 (resize step needed). Gemma 3 12B structured output quality needs validation against Gemini 2.5 Flash.
- **What we'll need to revisit:** If FLUX.2 Dev image quality is insufficient, test FLUX.2 Pro (~$0.03/image on Cloudflare, if available). If Gemma 3 12B quality is inadequate for Russian/CJK, switch to Mistral Small 3.1 24B (~2× neuron cost). If cost needs further reduction, downgrade to FLUX.2 Klein 4B (fast tier, ~$0.001/image) and rework consistency strategy. Monitor Cloudflare pricing changes. Increase CHAPTER_CONCURRENCY now that AI calls don't consume external subrequests.

## Action Items

1. [ ] Define `AIProvider` interface in `packages/core` matching current `GeminiClient` API surface
2. [ ] Refactor `GeminiClient` to implement `AIProvider`
3. [ ] Implement `CloudflareAIClient` using Workers AI binding (`env.AI.run()`)
4. [ ] Adapt `generateImage` for FLUX.2 Dev — resize reference images to 512×512 via Jimp before passing to AI binding
5. [ ] Add `AI` binding to `wrangler.jsonc` and `Env` type
6. [ ] Update `apps/api` workflow to instantiate `CloudflareAIClient` instead of `GeminiClient`
7. [ ] Adapt JSON schema format for Gemma 3 12B (`response_format` with `json_schema`)
8. [ ] Test with Russian-language book to validate Gemma 3 12B multilingual quality
9. [ ] Test FLUX.2 Dev image quality + consistency with reference images via Workers AI binding
10. [ ] Update ADR-001: increase `CHAPTER_CONCURRENCY` — AI binding calls bypass external subrequest limit
11. [ ] Add cost monitoring/logging — track neurons consumed per book for budget visibility
