/**
 * Cloudflare Queue consumer.
 *
 * Receives a single IllustrateJobMessage from the queue and triggers an
 * IllustrateBookWorkflow instance. The queue provides reliable delivery
 * and decouples the upload response time from Workflow startup.
 */

import { getLogger } from '@illustrator/core';

import { insertJob } from './db/job.db.js';
import type { Env, IllustrateJobMessage } from './types.js';

export async function handleQueue(
  batch: MessageBatch<IllustrateJobMessage>,
  env: Env
): Promise<void> {
  const log = getLogger();

  for (const msg of batch.messages) {
    const { bookId, r2Key } = msg.body;
    log.info('queue.received', { bookId, r2Key });

    try {
      // Create a new Workflow instance for this book
      const instance = await env.ILLUSTRATE_WORKFLOW.create({
        id: `illustrate-${bookId}`,
        params: { bookId, r2Key },
      });

      await insertJob(env.DB, instance.id, bookId);

      log.info('queue.workflow.started', { bookId, instanceId: instance.id });
      msg.ack();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error('queue.workflow.startFailed', { bookId, error });
      msg.retry();
    }
  }
}
