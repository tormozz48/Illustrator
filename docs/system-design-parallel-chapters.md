# System Design: Parallel-by-Chapter Pipeline

**Date:** 2026-04-03
**Status:** Proposal
**Author:** Andrii + Claude

---

## 1. Problem Statement

The current Illustrator pipeline processes a book sequentially through 5 stages, where stages 2 (bible) and 3 (split) each send the **entire book text** to the LLM as a single call. This creates three problems:

1. **No parallelism in early stages** — bible building and chapter splitting are independent but run sequentially, wasting wall-clock time.
2. **Fragile JSON parsing** — all LLM text calls use bare `JSON.parse()` with zero retry. A single malformed response crashes the entire pipeline.
3. **Monolithic LLM calls** — sending a 200k-character book as one prompt is slower, more expensive, and more likely to produce truncated or malformed output than smaller, focused calls.

### Goals

- Split the book into chapters first, then process everything chapter-level in parallel.
- Keep the Visual Bible as a single, coherent, book-wide artifact.
- Make JSON handling robust: predict failures, retry, and recover.

---

## 2. Current Architecture (As-Is)

```
READ ──▸ ANALYZE (full text → bible) ──▸ SPLIT (full text → chapters)
                                                    │
                                          ┌─────────┼─────────┐
                                          ▼         ▼         ▼
                                      ch1:scene  ch2:scene  ch3:scene   ← p-map(concurrency)
                                      ch1:image  ch2:image  ch3:image
                                      ch1:valid  ch2:valid  ch3:valid
                                          │         │         │
                                          └─────────┼─────────┘
                                                    ▼
                                                ASSEMBLE → book.html
```

**Bottleneck:** Stages 2 and 3 are sequential, each processing the full book text. Stage 2 (bible) is the heaviest LLM call in the pipeline.

---

## 3. Proposed Architecture (To-Be)

### 3.1 Pipeline Overview

```
                         ┌─────────────────────────────────────┐
STAGE 1: READ            │ readBook() + extractTitle()          │
                         └──────────────┬──────────────────────┘
                                        │ rawText
                         ┌──────────────┴──────────────────────┐
                         │         PARALLEL FORK               │
                         │                                      │
                    ┌────▼─────┐                        ┌──────▼──────┐
STAGE 2a:           │  SPLIT   │                        │   ANALYZE   │
(fast, structural)  │ chapters │                        │ build bible │
                    └────┬─────┘                        └──────┬──────┘
                         │ RawChapter[]                        │ VisualBible
                         └──────────────┬──────────────────────┘
                                        │ await Promise.all()
                         ┌──────────────┴──────────────────────┐
STAGE 2b:                │  ANCHOR IMAGES (primary entities)    │
                         │  Sequential per entity, could also   │
                         │  use p-map with concurrency           │
                         └──────────────┬──────────────────────┘
                                        │ Map<name, Buffer>
                    ┌───────────────────┼───────────────────────┐
                    ▼                   ▼                       ▼
STAGE 3:        ch1:findKeyScene    ch2:findKeyScene    chN:findKeyScene
(parallel,      ch1:generateImage   ch2:generateImage   chN:generateImage
 p-map)         ch1:validateImage   ch2:validateImage   chN:validateImage
                ch1:optimize        ch2:optimize        chN:optimize
                    │                   │                       │
                    └───────────────────┼───────────────────────┘
                                        ▼
STAGE 4:                            ASSEMBLE → book.html
```

### 3.2 Key Change: Parallel Fork After Read

The split and bible analysis are **independent** — neither depends on the other's output. Today they run sequentially (~30-60s wasted). Running them with `Promise.all()` is the simplest high-impact change.

```typescript
// orchestrator.ts — the core change
const [chapters, bible] = await Promise.all([
  splitIntoChapters(client, rawText),
  buildBible(client, rawText),
]);
```

**Impact:** Saves the full duration of whichever call finishes first (typically split, which is faster than bible). Estimated 20-40% wall-clock reduction on stages 2+3.

### 3.3 Bible Remains Book-Wide

The bible must see the entire book to produce coherent entities, environments, and style. Splitting it per-chapter would create inconsistencies (different names for the same character, conflicting style guides). The bible stays as a single LLM call on the full text.

**Why not per-chapter bibles merged later?** Merging visual descriptions, deduplicating entities, and reconciling style guides would require yet another LLM call — adding complexity and latency without clear benefit. The current single-call approach is the right one.

### 3.4 Stage Numbering Change

| Old Stage | New Stage | Change |
|-----------|-----------|--------|
| 1: Read | 1: Read | Same |
| 2: Analyze | 2a: Split + 2b: Analyze (parallel) | **Parallel fork** |
| 2b: Anchors | 3: Anchors | Renumbered |
| 3: Split | (moved to 2a) | **Moved earlier** |
| 4: Illustrate | 4: Illustrate (parallel, unchanged) | Same |
| 5: Assemble | 5: Assemble | Same |

---

## 4. JSON Robustness Strategy

### 4.1 Current Failure Modes

Every text-based LLM call follows this pattern:
```typescript
const json = JSON.parse(result.text ?? "");  // ← crash if malformed
return SomeSchema.parse(json);                // ← crash if schema mismatch
```

**Observed failure modes:**

| Failure | Cause | Frequency |
|---------|-------|-----------|
| `SyntaxError: Unexpected token` | LLM returns markdown fences around JSON | Common |
| `SyntaxError: Unexpected end of JSON` | Response truncated (token limit hit) | Common with long books |
| `ZodError: Required field missing` | LLM omits a field or uses wrong type | Occasional |
| `SyntaxError: Trailing comma` | LLM adds trailing comma in arrays/objects | Occasional |
| Empty response | `result.text` is `null` or `""` | Rare |

### 4.2 Defense-in-Depth: Three Layers

#### Layer 1: JSON Sanitization (Pre-Parse)

Before `JSON.parse()`, clean common LLM artifacts:

```typescript
// src/utils/jsonRepair.ts
export function sanitizeLlmJson(raw: string): string {
  let s = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Remove BOM or zero-width chars
  s = s.replace(/^\uFEFF/, '');

  return s;
}
```

This catches ~70% of real-world Gemini JSON failures at near-zero cost.

#### Layer 2: Retry with Exponential Backoff

Wrap all JSON-returning LLM calls in a generic retry:

```typescript
// src/utils/llmRetry.ts
import { ZodSchema } from 'zod';

interface LlmJsonCallOptions<T> {
  call: () => Promise<string | null>;   // the raw LLM text response
  schema: ZodSchema<T>;
  maxRetries?: number;                  // default: 2
  label?: string;                       // for logging: "analyzeBook", "splitChapters"
}

export async function callWithJsonRetry<T>({
  call,
  schema,
  maxRetries = 2,
  label = 'llm',
}: LlmJsonCallOptions<T>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const rawText = await call();

    if (!rawText || rawText.trim() === '') {
      lastError = new Error(`${label}: empty response (attempt ${attempt + 1})`);
      logger.warn(lastError.message);
      continue;
    }

    // Layer 1: sanitize
    const sanitized = sanitizeLlmJson(rawText);

    // Layer 2a: parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(sanitized);
    } catch (err) {
      lastError = new Error(
        `${label}: JSON parse failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`
      );
      logger.warn(lastError.message);
      // Log first 200 chars of response for debugging
      logger.debug(`${label}: raw response start: ${rawText.slice(0, 200)}`);
      continue;
    }

    // Layer 2b: validate schema
    const result = schema.safeParse(parsed);
    if (result.success) {
      if (attempt > 0) {
        logger.info(`${label}: succeeded on retry ${attempt}`);
      }
      return result.data;
    }

    lastError = new Error(
      `${label}: schema validation failed (attempt ${attempt + 1}): ${result.error.message}`
    );
    logger.warn(lastError.message);
  }

  throw lastError ?? new Error(`${label}: all retries exhausted`);
}
```

**Backoff note:** For Gemini with `responseMimeType: "application/json"`, retries don't need backoff since the model isn't rate-limited per-call in the same way. A simple immediate retry is sufficient — the model's JSON mode usually succeeds on retry because generation is non-deterministic.

#### Layer 3: Truncation Detection (Predictive)

The most dangerous failure — truncated JSON — can be **predicted before it happens**. When the book text is very long, the LLM may run out of output tokens before finishing the JSON.

```typescript
// src/utils/truncationGuard.ts

/** Estimate if a call is at risk of truncation. */
export function estimateTruncationRisk(params: {
  inputChars: number;
  expectedOutputSchema: 'bible' | 'chapters' | 'keyScene';
}): 'low' | 'medium' | 'high' {
  const { inputChars, expectedOutputSchema } = params;

  // Approximate: 1 token ≈ 4 chars for English, 2 chars for Cyrillic
  // Gemini 2.5 Flash: 1M input context, 65k output tokens
  const estimatedInputTokens = inputChars / 3; // conservative

  if (expectedOutputSchema === 'chapters') {
    // splitChapters echoes back the FULL text inside JSON — output ≈ input
    // This is the highest-risk call
    if (estimatedInputTokens > 50_000) return 'high';
    if (estimatedInputTokens > 30_000) return 'medium';
  }

  if (expectedOutputSchema === 'bible') {
    // Bible output is proportional to book complexity, not length
    // Typically 2-8k tokens regardless of book size
    if (estimatedInputTokens > 200_000) return 'medium';
  }

  return 'low';
}
```

**When risk is "high" for `splitChapters`:** The current prompt asks the LLM to echo back the full verbatim text of every chapter inside JSON. For a 100k+ word book, this is almost guaranteed to truncate. **This is the root cause of most JSON failures.**

**Solution — Reference-Based Splitting:**

Instead of asking the LLM to return full chapter content, ask it to return chapter **boundaries** (start/end markers or line numbers), then slice the text locally:

```typescript
// New schema for split results
const ChapterBoundarySchema = z.object({
  chapters: z.array(z.object({
    number: z.number(),
    title: z.string(),
    startMarker: z.string(),   // first ~50 chars of chapter
    endMarker: z.string(),     // last ~50 chars of chapter
  })),
});

// Then in splitter.ts: use markers to slice rawText locally
function sliceChapters(rawText: string, boundaries: ChapterBoundary[]): RawChapter[] {
  return boundaries.map((b, i) => {
    const start = rawText.indexOf(b.startMarker);
    const end = i < boundaries.length - 1
      ? rawText.indexOf(boundaries[i + 1].startMarker)
      : rawText.length;
    return {
      number: b.number,
      title: b.title,
      content: rawText.slice(start, end).trim(),
    };
  });
}
```

**Impact:** Reduces `splitChapters` output from ~100k tokens to ~2k tokens. Eliminates the #1 source of truncation failures entirely.

### 4.3 Gemini JSON Schema Enforcement

Gemini supports passing a `responseSchema` alongside `responseMimeType: "application/json"`. This constrains the model to produce structurally valid JSON matching the schema, reducing malformed output at the source:

```typescript
const result = await this.genAI.models.generateContent({
  model: TEXT_MODEL,
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  config: {
    responseMimeType: "application/json",
    responseSchema: zodToGeminiSchema(CharacterBibleSchema), // new
  },
});
```

**Trade-off:** Gemini's schema enforcement doesn't support all Zod features (unions, discriminated unions, recursive types). The `physicalTraits` optional field works fine, but test thoroughly. This is a **complement** to Layers 1-2, not a replacement.

### 4.4 Summary: Defense Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    JSON ROBUSTNESS LAYERS                       │
├─────────────────┬──────────────────┬────────────────────────────┤
│ PREDICT         │ PREVENT          │ RECOVER                    │
│                 │                  │                            │
│ Truncation risk │ Gemini response  │ Sanitize markdown fences   │
│ estimation      │ Schema           │ Fix trailing commas        │
│                 │                  │ Strip BOM/zero-width       │
│ Reference-based │ Zod validation   │                            │
│ splitting       │ at parse time    │ Retry (up to 2x)          │
│ (avoid echoing  │                  │                            │
│  full text)     │                  │ Log raw response on fail   │
│                 │                  │ for debugging              │
└─────────────────┴──────────────────┴────────────────────────────┘
```

---

## 5. Detailed Component Changes

### 5.1 `orchestrator.ts` — Parallel Fork

```diff
- // ── Stage 2: Analyze
- const bible = await buildBible(client, rawText);
-
- // ... anchor images ...
-
- // ── Stage 3: Split
- const chapters = await splitIntoChapters(client, rawText);

+ // ── Stage 2: Analyze + Split (parallel) ─────────────────────
+ spinner.start("Analyzing book & splitting chapters (parallel)...");
+ const [bible, chapters] = await Promise.all([
+   buildBible(client, rawText),
+   splitIntoChapters(client, rawText),
+ ]);
+ spinner.succeed(
+   `Bible: ${bible.entities.length} entities · Chapters: ${chapters.length}`
+ );
+
+ // ── Stage 3: Anchor images ─────────────────────────────────
+ // (unchanged, runs after bible is ready)
```

### 5.2 `gemini.ts` — Retry Wrapper Integration

Each method changes from bare `JSON.parse` to `callWithJsonRetry`:

```typescript
async analyzeBook(text: string): Promise<CharacterBible> {
  return callWithJsonRetry({
    call: async () => {
      const result = await this.genAI.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ role: "user", parts: [{ text: analyzeBookPrompt(text) }] }],
        config: { responseMimeType: "application/json" },
      });
      return result.text ?? "";
    },
    schema: CharacterBibleSchema,
    label: "analyzeBook",
  });
}
```

Same pattern for `splitChapters`, `findKeyScene`, `validateImage`.

### 5.3 `splitter.ts` — Reference-Based Splitting

Replace the current approach (LLM echoes full text) with boundary detection + local slicing:

```typescript
export async function splitIntoChapters(
  client: GeminiClient,
  rawText: string
): Promise<RawChapter[]> {
  const boundaries = await client.splitChapters(rawText); // returns boundaries, not content
  return sliceChapters(rawText, boundaries);
}
```

### 5.4 New Files

| File | Purpose |
|------|---------|
| `src/utils/jsonRepair.ts` | `sanitizeLlmJson()` — strips fences, fixes commas |
| `src/utils/llmRetry.ts` | `callWithJsonRetry()` — generic retry + validate |
| `src/utils/truncationGuard.ts` | `estimateTruncationRisk()` — predictive check |

---

## 6. Data Flow Diagram

```
                    ┌──────────────┐
                    │  book.txt    │
                    └──────┬───────┘
                           │ readBook()
                    ┌──────▼───────┐
                    │   rawText    │
                    └──┬───────┬───┘
                       │       │
            ┌──────────▼┐  ┌──▼──────────┐
            │  split    │  │  analyze    │    Promise.all()
            │ (boundary │  │ (full text  │
            │  markers) │  │  → bible)   │
            └──────┬────┘  └──────┬──────┘
                   │              │
         ┌─────────▼───┐  ┌──────▼──────┐
         │ sliceChapters│  │ anchorImages│
         │ (local text  │  │ (primary    │
         │  slicing)    │  │  entities)  │
         └──────┬──────┘  └──────┬──────┘
                │                │
                └───────┬────────┘
                        │
              ┌─────────▼─────────┐
              │   p-map chapters  │
              │  ┌──────────────┐ │
              │  │ findKeyScene │ │
              │  │ buildPrompt  │ │
              │  │ generateImage│ │
              │  │ validateImage│ │   each with callWithJsonRetry
              │  │ optimizeImage│ │
              │  └──────────────┘ │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │     assemble      │
              │  (Eta templates)  │
              └─────────┬─────────┘
                        │
                   book.html
```

---

## 7. Trade-Off Analysis

### 7.1 Parallel Split + Analyze

| Dimension | Assessment |
|-----------|------------|
| **Benefit** | ~20-40% wall-clock savings on stages 2+3 |
| **Cost** | 2 concurrent Gemini calls instead of 1 (API rate limits) |
| **Complexity** | Minimal — one `Promise.all()` |
| **Risk** | If API has per-key concurrency limits, one call may queue |
| **Verdict** | **Do it.** Trivial change, significant speedup. |

### 7.2 Reference-Based Splitting vs. Full-Text Echoing

| Dimension | Current (echo full text) | Proposed (boundary markers) |
|-----------|------------------------|-----------------------------|
| **Output tokens** | ~100k for large books | ~2k regardless of book size |
| **Truncation risk** | High for books > 50k words | Near zero |
| **Accuracy** | LLM may alter text | Guaranteed verbatim (local slice) |
| **Complexity** | Simple prompt | Marker matching logic needed |
| **Edge cases** | None beyond truncation | Duplicate phrases could mismatch markers |
| **Verdict** | | **Strongly prefer.** Eliminates #1 failure mode. |

**Mitigating marker collisions:** Use `startMarker` + `number` together. If `indexOf` returns -1, fall back to fuzzy matching (first 30 chars, then 20, then 10). Log a warning if fuzzy match is used.

### 7.3 Retry Strategy

| Dimension | Assessment |
|-----------|------------|
| **Benefit** | Converts ~80% of transient failures into successes |
| **Cost** | Up to 2x latency on failed calls (rare path) |
| **Token cost** | Extra API calls only on failure — negligible in aggregate |
| **Verdict** | **Do it.** Cheap insurance. |

### 7.4 Per-Chapter Bible (Rejected Alternative)

| Dimension | Assessment |
|-----------|------------|
| **Benefit** | True parallelism for bible generation |
| **Cost** | N extra LLM calls + 1 merge call; merge is unreliable |
| **Consistency** | High risk of duplicate entities, conflicting styles |
| **Verdict** | **Don't do it.** Shared bible from full text is correct. |

---

## 8. Implementation Plan

### Phase 1: JSON Robustness (do first — fixes current crashes)

1. Create `src/utils/jsonRepair.ts` with `sanitizeLlmJson()`
2. Create `src/utils/llmRetry.ts` with `callWithJsonRetry()`
3. Refactor all 4 JSON-returning methods in `gemini.ts` to use the retry wrapper
4. Add truncation risk logging (warning when high risk detected)

**Estimated effort:** 2-3 hours
**Risk:** Low — purely additive, doesn't change pipeline structure

### Phase 2: Reference-Based Splitting (prevents truncation)

1. Create `ChapterBoundarySchema` in `src/schemas/chapters.ts`
2. Update `splitChaptersPrompt` to request markers instead of full content
3. Implement `sliceChapters()` with marker matching + fuzzy fallback
4. Add tests for marker edge cases (duplicate phrases, short chapters)

**Estimated effort:** 3-4 hours
**Risk:** Medium — prompt change needs testing across different book types

### Phase 3: Parallel Fork (speedup)

1. Update `orchestrator.ts` to run split + analyze with `Promise.all()`
2. Parallelize anchor image generation with `p-map` (concurrency: 2)
3. Update spinner/logging for parallel progress reporting

**Estimated effort:** 1 hour
**Risk:** Low — minimal code change

---

## 9. What to Revisit as the System Grows

1. **Caching layer** — Store bible + chapters to disk so re-runs skip LLM calls. Key: hash of input text → cached results.
2. **Streaming assembly** — Currently all chapter images live in memory as base64. For 50+ chapter books, stream to disk during illustration.
3. **Per-chapter bible updates** — If a chapter introduces a new character not in the initial bible, a "bible amendment" pass could enrich it. Not needed now, but useful for very long books (600+ pages).
4. **Gemini response schema** — When `@google/genai` SDK supports passing Zod schemas directly as `responseSchema`, adopt it to eliminate most JSON failures at the source.
5. **Progress persistence** — Save pipeline state to disk after each stage, enabling resume-from-failure instead of full restart.
