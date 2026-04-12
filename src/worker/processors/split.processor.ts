import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Chapter } from '../../common/database/models/chapter.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';
import { sliceChapters } from '../../common/utils';
import { QUEUE_BOOK_PIPELINE } from '../../common/constants';

@Processor(QUEUE_BOOK_PIPELINE, { name: 'split' })
export class SplitProcessor extends WorkerHost {
  private readonly logger = new Logger(SplitProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ bookId: string }>) {
    const { bookId } = job.data;
    this.logger.log(`Splitting book ${bookId}`);

    try {
      await this.bookModel.update({ status: BookStatus.SPLITTING }, { where: { id: bookId } });

      const book = await this.bookModel.findByPk(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);

      const textBuffer = await this.storage.download(book.storageKey);
      const text = textBuffer.toString('utf-8');

      // Get chapter boundaries from AI
      const boundaries = await this.ai.splitChapters(text);
      await job.updateProgress(50);

      // Slice actual content using fuzzy matching
      const chapters = sliceChapters(text, boundaries);

      // Store chapters
      for (const ch of chapters) {
        await this.chapterModel.create({
          bookId,
          number: ch.number,
          title: ch.title,
          content: ch.content,
        });
      }

      // Update book title if found
      if (!book.title && chapters.length > 0) {
        const bible = await this.bibleModel.findOne({ where: { bookId } });
        if (bible?.data?.classification?.title) {
          await book.update({ title: bible.data.classification.title });
        }
      }

      await job.updateProgress(100);
      this.logger.log(`Book ${bookId} split into ${chapters.length} chapters`);
      return { bookId, chapterCount: chapters.length };
    } catch (err: any) {
      this.logger.error(`Failed to split book ${bookId}: ${err.message}`);
      await this.bookModel.update(
        { status: BookStatus.ERROR, errorMsg: err.message },
        { where: { id: bookId } },
      );
      throw err;
    }
  }
}
