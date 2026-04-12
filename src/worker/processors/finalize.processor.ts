import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { QUEUE_BOOK_PIPELINE } from '../../common/constants';

@Processor(QUEUE_BOOK_PIPELINE, { name: 'finalize' })
export class FinalizeProcessor extends WorkerHost {
  private readonly logger = new Logger(FinalizeProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
  ) {
    super();
  }

  async process(job: BullJob<{ bookId: string }>) {
    const { bookId } = job.data;
    this.logger.log(`Finalizing book ${bookId}`);

    await this.bookModel.update({ status: BookStatus.READY }, { where: { id: bookId } });

    this.logger.log(`Book ${bookId} is ready for illustration`);
    return { bookId, status: 'ready' };
  }
}
