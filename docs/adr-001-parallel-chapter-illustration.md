# ADR-001: Parallel Chapter Illustration on Cloudflare Workers

**Status:** Proposed
**Date:** 2026-04-04
**Deciders:** Andrii

## Context

The current Cloudflare Workflow (`IllustrateBookWorkflow`) processes chapter illustrations **sequentially** — one `step.do()` per chapter, in a `for...of` loop. For a 20-chapter book, this means 20 sequential workflow steps, each making 3–8 Gemini API calls (findKeyScene + generateImage + validateImage + retries). The total wall-clock time is dominated by network round-trips to the Gemini API, which are serialized unnecessarily.

The system design doc explicitly noted this trade-off:

> Steps are sequential (not parallel) in the MVP. This is a deliberate trade-off: simpler architecture, no coordination overhead, fits free tier limits. [...] For a SaaS, processing is async — the user doesn't wait. Sequential is acceptable.

Now that the MVP pipeline works, we want to add parallelism while staying within Cloudflare's free tier.

### Forces

1. **Wall-clock time**: A 20-chapter book takes ~10–20 minutes sequentially (30–60s per chapter). Users see "processing" status for too long.
2. **Free tier constraints**: 50 external subrequests per Worker invocation, 100K requests/day, 10K queue ops/day.
3. **Workflow durability**: Each `step.do()` is persisted and independently retryable. Batching chapters into fewer steps means coarser retry granularity.
4. **Gemini rate limits**: Concurrent API calls may hit per-key rate limits (RPM/TPM), but Gemini 2.5 Flash is generous with quotas.

## Decision

**Batch chapters into groups and process each group concurrently within a single workflow step**, using `Promise.allSettled()` inside the step callback.

Instead of:
```
for (const ch of chapters) {
  await step.do(`illustrate-ch-${ch.number}`, () => illustrateChapterStep(...));
}
```

We use:
```
for (const batch of chapterBatches) {
  await step.do(`illustrate-batch-${batchIndex}`, () =>
    illustrateBatchStep(batch, ...)
  );
}
```

Each batch processes `CHAPTER_CONCURRENCY` chapters (default: 3) in parallel via `Promise.allSettled()`.

## Options Considered

### Option A: Batched parallel within steps (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one new step file, minor orchestrator change |
| Free tier fit | Safe at batch size 3 (≤15–24 subrequests per step, well under 50) |
| Durability | Medium — if one chapter in a batch fails, the step retries all chapters in the batch. Mitigated by `Promise.allSettled()` + per-chapter error handling |
| Speedup | ~3x wall-clock reduction (from 20 sequential steps to ~7 batched steps) |
| Rate limit risk | Low at concurrency 3 — Gemini Flash handles 15+ RPM easily |

**Pros:**
- Minimal code change, easy to reason about
- Batch size is tunable (can reduce to 2 or increase to 5 later)
- Stays within 50 subrequest limit per step on free tier
- Each batch step is still independently retryable by Workflows

**Cons:**
- Coarser retry granularity (batch, not chapter). A failing chapter retries the whole batch.
- Already-completed chapters in a failed batch may re-run (idempotent writes to D1/R2 make this safe)

### Option B: Fan-out via child Workflows

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — parent/child workflow coordination, result aggregation |
| Free tier fit | Good — each child is its own instance with its own subrequest budget |
| Durability | Excellent — per-chapter retry with independent state |
| Speedup | Up to Nx (limited by Gemini rate limits, not CF) |
| Rate limit risk | High — 20 concurrent Gemini calls will likely trigger 429s |

**Pros:**
- True per-chapter durability and retry
- No subrequest limit concerns (each child has its own 50)

**Cons:**
- Significant complexity: parent must spawn children, poll for completion, aggregate results
- Higher Workflow instance count (1 parent + N children per book)
- Likely to trigger Gemini rate limits without additional throttling logic
- Overkill for the current scale

### Option C: Queue fan-out (one job per chapter)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — queue producer/consumer, chapter-level job tracking |
| Free tier fit | Risky — 20 chapters × 3 queue ops = 60 ops per book; 10K/day limit → ~166 books/day max |
| Durability | Good — each job is independently retried |
| Speedup | High — limited by queue consumer concurrency |

**Pros:**
- Natural parallelism via multiple queue consumers
- Independent retries per chapter

**Cons:**
- Burns queue operations fast (10K/day free limit)
- Requires coordination to know when all chapters are done before assembly
- More moving parts than needed

## Trade-off Analysis

The key trade-off is **retry granularity vs. simplicity**. Option A sacrifices per-chapter retry granularity for dramatically simpler code. Since:

1. Chapter illustration already has internal retry logic (up to 2 image regeneration attempts per chapter)
2. `Promise.allSettled()` prevents one failing chapter from crashing the entire batch
3. D1/R2 writes are idempotent (INSERT OR REPLACE), so re-running a successful chapter is harmless
4. Workflow-level step retry catches transient failures (network errors, 429s)

...the coarser retry boundary is acceptable.

## Free Tier Budget Analysis

### Per-batch subrequest count (batch size = 3)

| Operation | Calls per chapter | × 3 chapters | Notes |
|-----------|-------------------|---------------|-------|
| findKeyScene | 1 (+ 2 retries max) | 3–9 | Via callWithJsonRetry |
| generateImage | 1–3 | 3–9 | Up to MAX_RETRIES=2 validation cycles |
| validateImage | 1–3 | 3–9 | One per generateImage attempt |
| D1 writes | 2–3 | 6–9 | Chapters, anchors, illustrations (CF service, not external) |
| R2 puts | 1 | 3 | Image upload (CF service, not external) |
| **External total** | 3–9 | **9–27** | Well under 50 limit |

D1 and R2 are Cloudflare services (1000 subrequest limit), not external (50 limit). Only Gemini API calls count toward the 50 external subrequest limit. **Batch size 3 is safe even in worst-case retry scenarios.**

### Daily capacity (20-chapter book)

| Resource | Free limit | Per book | Books/day |
|----------|-----------|----------|-----------|
| Worker requests | 100K | ~30 | ~3,300 |
| Queue operations | 10K | 3 | ~3,300 |
| Workflow steps | 25K/instance | ~12 (7 batches + 5 other) | N/A |
| D1 writes | 100K | ~80 | ~1,250 |
| R2 writes | 1M/month | ~25 | ~40K/month |
| External subrequests | 50/invocation | ≤27/batch | OK |

**Conclusion:** Free tier comfortably supports this change. The bottleneck remains D1 writes at ~1,250 books/day, which is far beyond MVP needs.

## Consequences

- **What becomes easier:** Processing a 20-chapter book drops from ~15 minutes to ~5 minutes wall-clock. User experience improves significantly.
- **What becomes harder:** Debugging a failed batch requires checking which specific chapter(s) caused the failure (mitigated by per-chapter error logging).
- **What we'll need to revisit:** If scaling beyond free tier, switch to Option B (child workflows) for true per-chapter durability and higher parallelism.

## Action Items

1. [x] Create `illustrateBatch.step.ts` — processes N chapters concurrently within one step
2. [x] Modify `workflow/index.ts` — batch chapters and call the batch step
3. [x] Add `CHAPTER_CONCURRENCY` constant (default: 3) to workflow config
4. [ ] Test with a real book on `wrangler dev` to validate subrequest usage
5. [ ] Monitor Gemini API 429 rates after deployment
