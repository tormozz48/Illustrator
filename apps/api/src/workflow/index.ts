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

import { GeminiClient } from '../gemini.js';
import { getLogger, setLogger, workersLogger } from '../logger.js';
import type { Env, IllustrateJobMessage } from '../types.js';

import { updateBookStatus } from '../db/book.db.js';
import { markJobErrored } from '../db/job.db.js';
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
 * Each chapter illustration makes external calls to Gemini (findKeyScene,
 * generateImage, validateImage) plus D1/R2 writes. Cloudflare Workflows
 * allow up to 50 external subrequests per step.
 * 3 chapters × ~9 external ops = ~27 subrequests — safely within the limit.
 */
const CHAPTER_CONCURRENCY = 3;

// Replace the default consoleLogger with a structured JSON logger so all
// core pipeline logs (analyzer, splitter, illustrator) and step-level logs
// emit newline-delimited JSON that Workers Logs + Query Builder can parse.
setLogger(workersLogger);

export class IllustrateBookWorkflow extends WorkflowEntrypoint<Env, IllustrateJobMessage> {
  async run(event: WorkflowEvent<IllustrateJobMessage>, step: WorkflowStep) {
    const { bookId, r2Key } = event.payload;
    const { DB, BOOKS_BUCKET, CACHE, GEMINI_API_KEY } = this.env;

    const client = new GeminiClient(GEMINI_API_KEY);
    const setStatus = makeSetStatus(DB, bookId);
    const log = getLogger();
    const startedAt = Date.now();

    log.info('workflow.start', { bookId, r2Key });

    try {
      const bookText = await step.do('read-book', () =>
        readBookStep({ setStatus, BOOKS_BUCKET, r2Key })
      );

      const [bible, rawChapters] = await step.do('analyze-and-split', () =>
        analyzeAndSplitStep({ setStatus, client, bookText, bookId, DB })
      );

      log.info('workflow.analyzed', {
        bookId,
        chapterCount: rawChapters.length,
        primaryEntityCount: bible.entities.filter((e) => e.importance === 'primary').length,
        totalEntityCount: bible.entities.length,
      });

      await setStatus('anchoring');
      const anchorR2Keys: Record<string, string> = {};

      for (const entity of bible.entities.filter((e) => e.importance === 'primary')) {
        const anchorKey = await step.do(`anchor-${entity.name}`, () =>
          anchorEntityStep({ bookId, entity, bible, client, BOOKS_BUCKET })
        );
        if (anchorKey) {
          anchorR2Keys[entity.name] = anchorKey;
        }
      }

      log.info('workflow.anchored', { bookId, anchorsGenerated: Object.keys(anchorR2Keys).length });

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

      let totalIllustrated = 0;
      let totalSkipped = 0;

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        // biome-ignore lint/style/noNonNullAssertion: batchIdx always < batches.length
        const batch = batches[batchIdx]!;
        const label = batch.map((c) => c.number).join(',');
        const batchResults = await step.do(`illustrate-batch-${batchIdx}-ch${label}`, () =>
          illustrateBatchStep({
            bookId,
            chapters: batch,
            bible,
            anchorImages,
            client,
            DB,
            BOOKS_BUCKET,
          })
        );
        const succeeded = batchResults.filter((r) => r.imgR2Key !== null).length;
        const failed = batchResults.filter((r) => r.imgR2Key === null).length;
        totalIllustrated += succeeded;
        totalSkipped += failed;
      }

      log.info('workflow.illustrated', {
        bookId,
        batchCount: batches.length,
        totalIllustrated,
        totalSkipped,
      });

      const htmlR2Key = await step.do('assemble', () =>
        assembleStep({ setStatus, bookId, bible, DB, BOOKS_BUCKET })
      );
      await step.do('finalize', () => finalizeStep({ bookId, htmlR2Key, DB, CACHE }));

      log.info('workflow.complete', { bookId, htmlR2Key, durationMs: Date.now() - startedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('workflow.error', { bookId, error: msg, durationMs: Date.now() - startedAt });
      await updateBookStatus(DB, bookId, 'error', msg);
      await markJobErrored(DB, `illustrate-${bookId}`);
      throw err; // re-throw so Workflow marks the run as errored
    }
  }
}
