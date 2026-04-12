import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Chapter } from '../../common/database/models/chapter.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';
import { sliceChapters } from '../../common/utils';

@Injectable()
export class SplitProcessor {
  private readonly logger = new Logger(SplitProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
  ) {}

  async handle(job: BullJob<{ bookId: string }>) {
    const { bookId } = job.data;
    this.logger.log(`[split] Starting split for book ${bookId}`);

    try {
      await this.bookModel.update({ status: BookStatus.SPLITTING }, { where: { id: bookId } });
      this.logger.log(`[split] Book ${bookId}: status → SPLITTING`);

      const book = await this.bookModel.findByPk(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);

      this.logger.log(`[split] Book ${bookId}: downloading text from storage`);
      const textBuffer = await this.storage.download(book.storageKey);
      const text = textBuffer.toString('utf-8');
      this.logger.log(`[split] Book ${bookId}: text loaded (${text.length} chars)`);

      // Get chapter boundaries from AI
      this.logger.log(`[split] Book ${bookId}: calling AI splitChapters...`);
      const boundaries = await this.ai.splitChapters(text);
      await job.updateProgress(50);
      this.logger.log(`[split] Book ${bookId}: AI returned ${boundaries.length} boundaries`);

      // Slice actual content using fuzzy matching
      const chapters = sliceChapters(text, boundaries);
      this.logger.log(`[split] Book ${bookId}: sliced into ${chapters.length} chapters`);

      // Store chapters
      for (const ch of chapters) {
        await this.chapterModel.create({
          bookId,
          number: ch.number,
          title: ch.title,
          content: ch.content,
        });
        this.logger.log(`[split] Book ${bookId}: chapter ${ch.number} "${ch.title}" saved (${ch.content.length} chars)`);
      }

      // Update book title if found
      if (!book.title && chapters.length > 0) {
        const bible = await this.bibleModel.findOne({ where: { bookId } });
        if (bible?.data?.classification?.title) {
          await book.update({ title: bible.data.classification.title });
          this.logger.log(`[split] Book ${bookId}: title set to "${bible.data.classification.title}"`);
        }
      }

      await job.updateProgress(100);
      this.logger.log(`[split] Book ${bookId}: ✔ split complete — ${chapters.length} chapters created`);
      return { bookId, chapterCount: chapters.length };
    } catch (err: any) {
      this.logger.error(`[split] Book ${bookId}: ✘ FAILED — ${err.message}`, err.stack);
      await this.bookModel.update(
        { status: BookStatus.ERROR, errorMsg: err.message },
        { where: { id: bookId } },
      );
      throw err;
    }
  }
}
