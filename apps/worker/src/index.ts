import { JOB_NAMES } from '@illustrator/shared/jobs';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from './env.js';
import { handleAssembleBook } from './handlers/assembleBook.js';
import { handleGenerateStyleBible } from './handlers/generateStyleBible.js';
import { handleProcessChapter } from './handlers/processChapter.js';
import { handleSplitChapters } from './handlers/splitChapters.js';
import { logger } from './logger.js';

/**
 * Redis connection for BullMQ
 */
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * BullMQ worker — processes jobs from book-processing queue
 */
const worker = new Worker(
  'book-processing',
  async (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Processing job');

    switch (job.name) {
      case JOB_NAMES.SPLIT_CHAPTERS:
        await handleSplitChapters(job);
        break;

      case JOB_NAMES.GENERATE_STYLE_BIBLE:
        await handleGenerateStyleBible(job);
        break;

      case JOB_NAMES.PROCESS_CHAPTER:
        await handleProcessChapter(job);
        break;

      case JOB_NAMES.ASSEMBLE_BOOK:
        await handleAssembleBook(job);
        break;

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }

    logger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
  },
  {
    connection,
    concurrency: 2, // Max 2 concurrent jobs
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 1000, // 1 second
    },
  }
);

/**
 * Worker event listeners
 */
worker.on('completed', (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Job completed successfully');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, error: err }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ error: err }, 'Worker error');
});

logger.info('BullMQ worker started');

/**
 * Graceful shutdown
 */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing worker...');
  await worker.close();
  process.exit(0);
});
