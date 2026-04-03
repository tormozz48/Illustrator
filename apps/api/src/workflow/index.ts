/**
 * IllustrateBookWorkflow
 *
 * Cloudflare Workflow that runs the full bookillust pipeline durably.
 * Each step is automatically retried on failure and its result is persisted
 * in Workflow state so it won't re-run if the Worker restarts.
 *
 * Step order:
 *   1. read-book          — fetch raw text from R2
 *   2. analyze-and-split  — buildBible + splitIntoChapters (parallel)
 *   3. anchor-{name}      — generate reference portrait for each primary entity
 *   4. illustrate-ch-{n}  — illustrateChapter for each chapter
 *   5. assemble           — build reader HTML, upload to R2
 *   6. finalize           — mark book done in D1
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';

import { GeminiClient, setLogger, consoleLogger } from '@illustrator/core';

import type { Env, IllustrateJobMessage } from '../types.js';

import { makeSetStatus } from './setStatus.js';
import { readBookStep } from './readBook.step.js';
import { analyzeAndSplitStep } from './analyzeAndSplit.step.js';
import { anchorEntityStep } from './anchor.step.js';
import { illustrateChapterStep } from './illustrateChapter.step.js';
import { assembleStep } from './assemble.step.js';
import { finalizeStep } from './finalize.step.js';

// Use the built-in console logger (no Winston in Workers)
setLogger(consoleLogger);

export class IllustrateBookWorkflow extends WorkflowEntrypoint<
  Env,
  IllustrateJobMessage
> {
  async run(event: WorkflowEvent<IllustrateJobMessage>, step: WorkflowStep) {
    const { bookId, r2Key } = event.payload;
    const { DB, BOOKS_BUCKET, CACHE, GEMINI_API_KEY } = this.env;

    const gemini = new GeminiClient(GEMINI_API_KEY);
    const setStatus = makeSetStatus(DB, bookId);

    try {
      // ── Step 1: Read raw text from R2 ────────────────────────────────────
      const bookText = await step.do('read-book', () =>
        readBookStep({ setStatus, BOOKS_BUCKET, r2Key })
      );

      // ── Step 2: Analyze + split (both read rawText; run in parallel) ─────
      const [bible, rawChapters] = await step.do('analyze-and-split', () =>
        analyzeAndSplitStep({ setStatus, gemini, bookText, bookId, DB })
      );

      // ── Step 3: Generate anchor (reference) images for primary entities ──
      await setStatus('anchoring');
      const anchorR2Keys: Record<string, string> = {};

      for (const entity of bible.entities.filter((e) => e.importance === 'primary')) {
        const anchorKey = await step.do(`anchor-${entity.name}`, () =>
          anchorEntityStep({ bookId, entity, bible, gemini, BOOKS_BUCKET })
        );
        if (anchorKey) anchorR2Keys[entity.name] = anchorKey;
      }

      // ── Step 4: Illustrate each chapter ───────────────────────────────────
      await setStatus('illustrating');

      // Load anchor image buffers from R2 for use as reference images
      const anchorImages = new Map<string, Buffer>();
      for (const [name, key] of Object.entries(anchorR2Keys)) {
        const obj = await BOOKS_BUCKET.get(key);
        if (obj) {
          const ab = await obj.arrayBuffer();
          anchorImages.set(name, Buffer.from(ab));
        }
      }

      for (const ch of rawChapters) {
        await step.do(`illustrate-ch-${ch.number}`, () =>
          illustrateChapterStep({ bookId, ch, bible, anchorImages, gemini, DB, BOOKS_BUCKET })
        );
      }

      // ── Step 5: Assemble HTML reader ──────────────────────────────────────
      const htmlR2Key = await step.do('assemble', () =>
        assembleStep({ setStatus, bookId, bible, DB, BOOKS_BUCKET })
      );

      // ── Step 6: Finalize ──────────────────────────────────────────────────
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
