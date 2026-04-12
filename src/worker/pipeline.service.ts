import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowProducer } from 'bullmq';
import {
  QUEUE_BOOK_PIPELINE,
  JOB_SPLIT,
  JOB_ANCHOR,
  JOB_PREPARE_SCENES,
  JOB_FINALIZE,
} from '../common/constants';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private flowProducer: FlowProducer;

  constructor(private config: ConfigService) {
    this.flowProducer = new FlowProducer({
      connection: {
        host: config.get('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6379),
      },
    });
  }

  /**
   * After analysis is complete, compose the rest of the pipeline as a BullMQ Flow.
   *
   * BullMQ FlowProducer: children complete BEFORE their parent starts.
   * Siblings (children of the same parent) run in parallel.
   *
   * Desired execution order:
   *   1. SPLIT  (creates chapter records — must run first)
   *   2. ANCHORS (only need bible, run in parallel) +
   *      PREPARE_SCENES batches (need chapters from split, run sequentially)
   *   3. FINALIZE (runs after everything above completes)
   *
   * Tree structure:
   *   FINALIZE
   *   ├── ANCHOR[0]          ← siblings run in parallel
   *   ├── ANCHOR[1]
   *   └── PREPARE_SCENES[N-1]  ← last batch
   *       └── PREPARE_SCENES[N-2]
   *           └── …
   *               └── PREPARE_SCENES[0]  ← first batch
   *                   └── SPLIT          ← leaf, executes first
   */
  async composePipelineAfterAnalysis(
    bookId: string,
    entityNames: string[],
    chapterCount: number,
  ) {
    const BATCH_SIZE = 3;
    const batches: number[][] = [];
    for (let i = 0; i < chapterCount; i += BATCH_SIZE) {
      const batch: number[] = [];
      for (let j = i; j < Math.min(i + BATCH_SIZE, chapterCount); j++) {
        batch.push(j + 1); // chapter numbers are 1-based
      }
      batches.push(batch);
    }

    // Anchor jobs (only need bible — run in parallel at the FINALIZE level)
    const anchorJobs = entityNames.map(name => ({
      name: JOB_ANCHOR,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId, entityName: name },
    }));

    // Build a chain: SPLIT → PS[0] → PS[1] → … → PS[N-1]
    // SPLIT is the leaf (runs first); each PS batch wraps the previous as its child.
    let prepareChain: any = {
      name: JOB_SPLIT,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId },
    };

    for (let idx = 0; idx < batches.length; idx++) {
      prepareChain = {
        name: JOB_PREPARE_SCENES,
        queueName: QUEUE_BOOK_PIPELINE,
        data: { bookId, chapterNumbers: batches[idx], batchIndex: idx },
        children: [prepareChain],
      };
    }

    // Compose the full flow
    const flow = await this.flowProducer.add({
      name: JOB_FINALIZE,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId },
      children: [
        prepareChain,
        ...anchorJobs,
      ],
    });

    this.logger.log(
      `[pipeline] Flow composed for book ${bookId}:\n` +
      `  • 1 × SPLIT job\n` +
      `  • ${batches.length} × PREPARE_SCENES batches (chapters: ${batches.map(b => `[${b.join(',')}]`).join(', ')})\n` +
      `  • ${anchorJobs.length} × ANCHOR jobs (entities: [${entityNames.join(', ')}])\n` +
      `  • 1 × FINALIZE job\n` +
      `  • Flow root job id: ${flow.job.id}`,
    );
    return flow;
  }
}
