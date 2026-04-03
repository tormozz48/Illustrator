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

import {
  GeminiClient,
  buildBible,
  splitIntoChapters,
  buildAnchorPrompt,
  illustrateChapter,
  assembleWebHtml,
  setLogger,
  consoleLogger,
  type CharacterBible,
  type RawChapter,
  type EnrichedChapter,
} from '@illustrator/core';

import type { Env, IllustrateJobMessage } from '../types.js';

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

    /** Update book status column in D1 */
    const setStatus = async (status: string, errorMsg?: string) => {
      await DB.prepare(
        `UPDATE books SET status = ?, error_msg = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(status, errorMsg ?? null, bookId)
        .run();
    };

    try {
      // ── Step 1: Read raw text from R2 ────────────────────────────────────
      const bookText = await step.do('read-book', async () => {
        await setStatus('analyzing');
        const obj = await BOOKS_BUCKET.get(r2Key);
        if (!obj) throw new Error(`R2 object not found: ${r2Key}`);
        return obj.text();
      });

      // ── Step 2: Analyze + split (both read rawText; run in parallel) ─────
      const [bible, rawChapters] = await step.do('analyze-and-split', async () => {
        await setStatus('splitting');
        const [b, ch] = await Promise.all([
          buildBible(gemini, bookText),
          splitIntoChapters(gemini, bookText),
        ]);

        // Persist bible
        await DB.prepare(
          `INSERT OR REPLACE INTO bibles (book_id, data, created_at)
           VALUES (?, ?, datetime('now'))`
        )
          .bind(bookId, JSON.stringify(b))
          .run();

        // Persist chapters
        const stmts = ch.map((c) =>
          DB.prepare(
            `INSERT OR IGNORE INTO chapters (book_id, number, title, content, created_at)
             VALUES (?, ?, ?, ?, datetime('now'))`
          ).bind(bookId, c.number, c.title ?? '', c.content)
        );
        if (stmts.length > 0) await DB.batch(stmts);

        return [b, ch] as [CharacterBible, RawChapter[]];
      });

      // ── Step 3: Generate anchor (reference) images for primary entities ──
      await setStatus('anchoring');
      // anchorR2Keys: entity name → R2 key
      const anchorR2Keys: Record<string, string> = {};

      const primaryEntities = bible.entities.filter((e) => e.importance === 'primary');

      for (const entity of primaryEntities) {
        const anchorKey = await step.do(`anchor-${entity.name}`, async () => {
          const prompt = buildAnchorPrompt({
            entity,
            stylePrefix: bible.styleGuide.stylePrefix,
            negativePrompt: bible.styleGuide.negativePrompt,
          });

          try {
            const imgBuf = await gemini.generateImage(prompt);
            const key = `books/${bookId}/anchors/${entity.name.replace(/\s+/g, '_')}.webp`;
            await BOOKS_BUCKET.put(key, imgBuf, {
              httpMetadata: { contentType: 'image/webp' },
            });
            return key;
          } catch {
            // Anchor generation is best-effort; don't fail the whole workflow
            return null;
          }
        });

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
        await step.do(`illustrate-ch-${ch.number}`, async () => {
          let enriched: EnrichedChapter;
          try {
            enriched = await illustrateChapter({
              client: gemini,
              chapter: ch,
              bible,
              anchorImages,
            });
          } catch {
            // If illustration fails for a chapter, skip it gracefully
            return null;
          }

          // Persist anchor (key-scene location) to D1
          const chRow = await DB.prepare(
            `SELECT id FROM chapters WHERE book_id = ? AND number = ?`
          )
            .bind(bookId, ch.number)
            .first<{ id: number }>();

          if (!chRow) return null;

          await DB.prepare(
            `INSERT OR REPLACE INTO anchors (chapter_id, insert_after_para, created_at)
             VALUES (?, ?, datetime('now'))`
          )
            .bind(chRow.id, enriched.keyScene.insertAfterParagraph)
            .run();

          if (!enriched.illustration) return null;

          // Decode base64 and upload to R2
          const imgBuf = Buffer.from(enriched.illustration.imageBase64, 'base64');
          const imgR2Key = `books/${bookId}/chapters/${ch.number}/img.webp`;
          await BOOKS_BUCKET.put(imgR2Key, imgBuf, {
            httpMetadata: { contentType: 'image/webp' },
          });

          await DB.prepare(
            `INSERT OR REPLACE INTO illustrations
             (chapter_id, r2_key, width, height, bytes, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`
          )
            .bind(
              chRow.id,
              imgR2Key,
              enriched.illustration.width,
              enriched.illustration.height,
              imgBuf.byteLength
            )
            .run();

          return imgR2Key;
        });
      }

      // ── Step 5: Assemble HTML reader ──────────────────────────────────────
      const htmlR2Key = await step.do('assemble', async () => {
        await setStatus('assembling');

        const bookRow = await DB.prepare(
          `SELECT title, author FROM books WHERE id = ?`
        )
          .bind(bookId)
          .first<{ title: string; author: string | null }>();

        const { results: chRows } = await DB.prepare(
          `SELECT ch.number, ch.title, ch.content,
                  an.insert_after_para,
                  CASE WHEN il.chapter_id IS NOT NULL THEN 1 ELSE 0 END AS has_illustration
           FROM chapters ch
           LEFT JOIN anchors an ON an.chapter_id = ch.id
           LEFT JOIN illustrations il ON il.chapter_id = ch.id
           WHERE ch.book_id = ?
           ORDER BY ch.number`
        )
          .bind(bookId)
          .all<{
            number: number;
            title: string;
            content: string;
            insert_after_para: number | null;
            has_illustration: number;
          }>();

        const webChapters = chRows.map((row) => ({
          number: row.number,
          title: row.title,
          content: row.content,
          keyScene:
            row.insert_after_para !== null
              ? { insertAfterParagraph: row.insert_after_para }
              : null,
          hasIllustration: row.has_illustration === 1,
        }));

        const html = assembleWebHtml({
          bookId,
          title: bookRow?.title ?? 'Untitled',
          author: bookRow?.author ?? undefined,
          bible,
          chapters: webChapters,
          generatedAt: new Date().toISOString(),
        });

        const key = `books/${bookId}/reader.html`;
        await BOOKS_BUCKET.put(key, html, {
          httpMetadata: { contentType: 'text/html; charset=utf-8' },
        });
        return key;
      });

      // ── Step 6: Finalize ──────────────────────────────────────────────────
      await step.do('finalize', async () => {
        await DB.prepare(
          `UPDATE books
           SET status = 'done', html_r2_key = ?, error_msg = NULL, updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(htmlR2Key, bookId)
          .run();

        // Invalidate any cached HTML
        await CACHE.delete(`html:${bookId}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await DB.prepare(
        `UPDATE books SET status = 'error', error_msg = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(msg, bookId)
        .run();
      throw err; // re-throw so Workflow marks the run as errored
    }
  }
}
