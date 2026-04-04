/**
 * IllustrateBookWorkflow
 *
 * Cloudflare Workflow that runs the full bookillust pipeline durably.
 * Each step is automatically retried on failure and its result is persisted
 * in Workflow state so it won't re-run if the Worker restarts.
 *
 * Step order:
 *   1. read-book                     — fetch raw text from R2
 *   2. analyze-and-split             — buildBible + splitIntoChapters (parallel)
 *   3. anchor-{name}                 — generate reference portrait for each primary entity
 *   4. illustrate-batch-{n}-ch{...}  — illustrate chapters in parallel batches (CHAPTER_CONCURRENCY per batch)
 *   5. assemble                      — build reader HTML, upload to R2
 *   6. finalize                      — mark book done in D1
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

import { GeminiClient, consoleLogger, setLogger } from '@illustrator/core';

import type { Env, IllustrateJobMessage } from '../types.js';

import { analyzeAndSplitStep } from './analyzeAndSplit.step.js';
import { anchorEntityStep } from './anchor.step.js';
import { assembleStep } from './assemble.step.js';
import { finalizeStep } from './finalize.step.js';
import { illustrateBatchStep } from './illustrateBatch.step.js';
import { readBookStep } from './readBook.step.js';
import { makeSetStatus } from './setStatus.js';

/**
 * Number of chapters to process concurrently within a single Workflow step.
 *
 * Free tier budget: 50 external subrequests per step.
 * Each chapter uses 3–9 Gemini API calls (external).
 * Batch of 3 → 9–27 external subrequests → safe under 50.
 *
 * Increase to 5 on paid tier (no subrequest limit).
 */
const CHAPTER_CONCURRENCY = 3;

// Use the built-in console logger (no Winston in Workers)
setLogger(consoleLogger);

export class IllustrateBookWorkflow extends WorkflowEntrypoint<Env, IllustrateJobMessage> {
  async run(event: WorkflowEvent<IllustrateJobMessage>, step: WorkflowStep) {
    const { bookId, r2Key } = event.payload;
    const { DB, BOOKS_BUCKET, CACHE, GEMINI_API_KEY } = this.env;

    const gemini = new GeminiClient(GEMINI_API_KEY);
    const setStatus = makeSetStatus(DB, bookId);

    try {
      const bookText = await step.do('read-book', () =>
        readBookStep({ setStatus, BOOKS_BUCKET, r2Key })
      );
      const [bible, rawChapters] = await step.do('analyze-and-split', () =>
        analyzeAndSplitStep({ setStatus, gemini, bookText, bookId, DB })
      );

      await setStatus('anchoring');
      const anchorR2Keys: Record<string, string> = {};

      for (const entity of bible.entities.filter((e) => e.importance === 'primary')) {
        const anchorKey = await step.do(`anchor-${entity.name}`, () =>
          anchorEntityStep({ bookId, entity, bible, gemini, BOOKS_BUCKET })
        );
        if (anchorKey) anchorR2Keys[entity.name] = anchorKey;
      }

      await setStatus('illustrating');
      const anchorImages = new Map<string, Buffer>();
      for (const [name, key] of Object.entries(anchorR2Keys)) {
        const obj = await BOOKS_BUCKET.get(key);
        if (obj) {
          const ab = await obj.arrayBuffer();
          anchorImages.set(name, Buffer.from(ab));
        }
      }

      // ── Parallel chapter illustration in batches ───────────────────
      // Group chapters into batches of CHAPTER_CONCURRENCY and process
      // each batch concurrently within a single Workflow step.
      // See ADR-001 for rationale and free-tier budget analysis.
      const batches: (typeof rawChapters)[] = [];
      for (let i = 0; i < rawChapters.length; i += CHAPTER_CONCURRENCY) {
        batches.push(rawChapters.slice(i, i + CHAPTER_CONCURRENCY));
      }

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        // biome-ignore lint/style/noNonNullAssertion: batchIdx always < batches.length
        const batch = batches[batchIdx]!;
        const label = batch.map((c) => c.number).join(',');
        await step.do(`illustrate-batch-${batchIdx}-ch${label}`, () =>
          illustrateBatchStep({
            bookId,
            chapters: batch,
            bible,
            anchorImages,
            gemini,
            DB,
            BOOKS_BUCKET,
          })
        );
      }

      const htmlR2Key = await step.do('assemble', () =>
        assembleStep({ setStatus, bookId, bible, DB, BOOKS_BUCKET })
      );
      await step.do('finalize', () => finalizeStep({ bookId, htmlR2Key, DB, CACHE }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await DB.prepare(
        `UPDATE books SET status = 'error', error_msg = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(msg, bookId)
        .run();
      await DB.prepare(
        `UPDATE jobs SET workflow_status = 'errored', finished_at = datetime('now') WHERE id = ?`
      )
        .bind(`illustrate-${bookId}`)
        .run();
      throw err; // re-throw so Workflow marks the run as errored
    }
  }
}
