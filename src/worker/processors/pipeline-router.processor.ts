import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { QUEUE_BOOK_PIPELINE, JOB_ANALYZE, JOB_SPLIT, JOB_ANCHOR, JOB_PREPARE_SCENES, JOB_FINALIZE } from '../../common/constants';
import { AnalyzeProcessor } from './analyze.processor';
import { SplitProcessor } from './split.processor';
import { AnchorProcessor } from './anchor.processor';
import { PrepareScenesProcessor } from './prepare-scenes.processor';
import { FinalizeProcessor } from './finalize.processor';

/**
 * Single BullMQ Worker for the book-pipeline queue.
 *
 * BullMQ Workers do NOT filter jobs by name — every Worker attached to a
 * queue competes for ALL jobs on that queue.  The previous code created
 * five separate Workers (one per @Processor class), so any job could be
 * picked up by any processor, leading to wrong handlers running and the
 * pipeline stalling.
 *
 * This router is the only @Processor on QUEUE_BOOK_PIPELINE.  It inspects
 * `job.name` and dispatches to the correct handler service.
 */
@Processor(QUEUE_BOOK_PIPELINE)
export class PipelineRouterProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineRouterProcessor.name);

  constructor(
    private analyzeProcessor: AnalyzeProcessor,
    private splitProcessor: SplitProcessor,
    private anchorProcessor: AnchorProcessor,
    private prepareScenesProcessor: PrepareScenesProcessor,
    private finalizeProcessor: FinalizeProcessor,
  ) {
    super();
  }

  async process(job: BullJob): Promise<any> {
    const start = Date.now();
    this.logger.log(`▶ [${job.name}] job ${job.id} started | data=${JSON.stringify(job.data)}`);

    try {
      let result: any;

      switch (job.name) {
        case JOB_ANALYZE:
          result = await this.analyzeProcessor.handle(job);
          break;
        case JOB_SPLIT:
          result = await this.splitProcessor.handle(job);
          break;
        case JOB_ANCHOR:
          result = await this.anchorProcessor.handle(job);
          break;
        case JOB_PREPARE_SCENES:
          result = await this.prepareScenesProcessor.handle(job);
          break;
        case JOB_FINALIZE:
          result = await this.finalizeProcessor.handle(job);
          break;
        default:
          this.logger.error(`✘ Unknown job name: "${job.name}" (id=${job.id})`);
          throw new Error(`Unknown pipeline job name: ${job.name}`);
      }

      const elapsed = Date.now() - start;
      this.logger.log(`✔ [${job.name}] job ${job.id} completed in ${elapsed}ms`);
      return result;
    } catch (err: any) {
      const elapsed = Date.now() - start;
      this.logger.error(`✘ [${job.name}] job ${job.id} failed after ${elapsed}ms: ${err.message}`);
      throw err;
    }
  }
}
