/**
 * Cloudflare Queue consumer.
 *
 * Receives a single IllustrateJobMessage from the queue and triggers an
 * IllustrateBookWorkflow instance. The queue provides reliable delivery
 * and decouples the upload response time from Workflow startup.
 */

import type { Env, IllustrateJobMessage } from './types.js';

export async function handleQueue(
  batch: MessageBatch<IllustrateJobMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    const { bookId, r2Key } = msg.body;

    try {
      // Create a new Workflow instance for this book
      const instance = await env.ILLUSTRATE_WORKFLOW.create({
        id: `illustrate-${bookId}`,
        params: { bookId, r2Key },
      });

      // Record job in D1
      await env.DB.prepare(
        `INSERT OR IGNORE INTO jobs (id, book_id, workflow_status, started_at, created_at)
         VALUES (?, ?, 'running', datetime('now'), datetime('now'))`
      )
        .bind(instance.id, bookId)
        .run();

      msg.ack();
    } catch (err) {
      console.error(`Failed to start workflow for book ${bookId}:`, err);
      msg.retry();
    }
  }
}
