import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueEventsHost, QueueEventsListener, OnQueueEvent } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BooksGateway } from './books.gateway';
import { QUEUE_IMAGE_GENERATION } from '../../common/constants';

@Injectable()
@QueueEventsListener(QUEUE_IMAGE_GENERATION)
export class ImageGenerationEventsListener extends QueueEventsHost {
  private readonly logger = new Logger(ImageGenerationEventsListener.name);

  constructor(
    @InjectQueue(QUEUE_IMAGE_GENERATION) private imageQueue: Queue,
    private gateway: BooksGateway,
  ) {
    super();
  }

  @OnQueueEvent('progress')
  async onProgress({ jobId, data }: { jobId: string; data: any }) {
    this.logger.log(`[DEBUG] Job ${jobId} progress event received: type=${data?.type}`);

    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      this.logger.warn(`[DEBUG] Job ${jobId} not found for progress event`);
      return;
    }

    const { bookId, chapterNum } = job.data;

    if (data.type === 'variant') {
      this.logger.log(`[DEBUG] Forwarding variant-generated event for book ${bookId}, chapter ${chapterNum}, scene ${data.sceneId}`);
      this.gateway.emitVariantGenerated(bookId, chapterNum, data.sceneId, data.variant);
    } else if (data.type === 'error') {
      this.logger.warn(`[DEBUG] Scene ${data.sceneId} generation error: ${data.error}`);
    }
  }

  @OnQueueEvent('completed')
  async onCompleted({ jobId }: { jobId: string }) {
    this.logger.log(`[DEBUG] Job ${jobId} completed`);

    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      this.logger.warn(`[DEBUG] Job ${jobId} not found for completed event`);
      return;
    }

    const { bookId, chapterNum } = job.data;
    this.logger.log(`[DEBUG] Emitting generation-done for book ${bookId}, chapter ${chapterNum}`);
    this.gateway.emitGenerationDone(bookId, chapterNum);
  }

  @OnQueueEvent('failed')
  async onFailed({ jobId, failedReason }: { jobId: string; failedReason: string }) {
    this.logger.error(`[DEBUG] Job ${jobId} failed: ${failedReason}`);

    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      this.logger.warn(`[DEBUG] Job ${jobId} not found for failed event`);
      return;
    }

    const { bookId, chapterNum } = job.data;
    this.logger.error(`[DEBUG] Emitting generation-error for book ${bookId}, chapter ${chapterNum}: ${failedReason}`);
    this.gateway.emitGenerationError(bookId, chapterNum, failedReason);
  }
}
