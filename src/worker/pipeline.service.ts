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
   * Flow: split -> anchors (parallel) -> prepare-scenes (batched) -> finalize
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

    // Build prepare-scenes children (depend on anchors completing)
    const prepareSceneJobs = batches.map((chapterNums, idx) => ({
      name: JOB_PREPARE_SCENES,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId, chapterNumbers: chapterNums, batchIndex: idx },
    }));

    // Build anchor children (depend on split completing)
    const anchorJobs = entityNames.map(name => ({
      name: JOB_ANCHOR,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId, entityName: name },
      children: prepareSceneJobs.length > 0 ? undefined : undefined,
    }));

    // Build the flow: finalize depends on prepare-scenes, which depends on anchors, which depends on split
    // BullMQ Flow: parent waits for all children to complete
    const flow = await this.flowProducer.add({
      name: JOB_FINALIZE,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId },
      children: prepareSceneJobs.map(psJob => ({
        ...psJob,
        children: anchorJobs.map(aJob => ({
          ...aJob,
          children: [{
            name: JOB_SPLIT,
            queueName: QUEUE_BOOK_PIPELINE,
            data: { bookId },
          }],
        })),
      })),
    });

    this.logger.log(`Pipeline flow composed for book ${bookId}: ${entityNames.length} anchors, ${batches.length} scene batches`);
    return flow;
  }
}
