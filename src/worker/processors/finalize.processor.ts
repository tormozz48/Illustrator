import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';

@Injectable()
export class FinalizeProcessor {
  private readonly logger = new Logger(FinalizeProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
  ) {}

  async handle(job: BullJob<{ bookId: string }>) {
    const { bookId } = job.data;
    this.logger.log(`[finalize] Finalizing book ${bookId}`);

    await this.bookModel.update({ status: BookStatus.READY }, { where: { id: bookId } });

    this.logger.log(`[finalize] Book ${bookId}: ✔ status → READY — book is available for illustration`);
    return { bookId, status: 'ready' };
  }
}
