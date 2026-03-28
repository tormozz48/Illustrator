import type { JobContracts } from '@illustrator/shared/jobs';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from './env.js';

/**
 * Redis connection for BullMQ
 */
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * BullMQ queue for book processing jobs
 */
export const bookQueue = new Queue<JobContracts[keyof JobContracts]>('book-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
