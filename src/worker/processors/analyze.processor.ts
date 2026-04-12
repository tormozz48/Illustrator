import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';
import { PipelineService } from '../pipeline.service';
import { QUEUE_BOOK_PIPELINE } from '../../common/constants';

@Processor(QUEUE_BOOK_PIPELINE, { name: 'analyze' })
export class AnalyzeProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyzeProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
    private pipelineService: PipelineService,
  ) {
    super();
  }

  async process(job: BullJob<{ bookId: string }>) {
    const { bookId } = job.data;
    this.logger.log(`Analyzing book ${bookId}`);

    try {
      // Update status
      await this.bookModel.update({ status: BookStatus.ANALYZING }, { where: { id: bookId } });

      // Read book text from storage
      const book = await this.bookModel.findByPk(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);

      const textBuffer = await this.storage.download(book.storageKey);
      const text = textBuffer.toString('utf-8');

      // Analyze with AI
      await job.updateProgress(10);
      const bible = await this.ai.analyzeBook(text);
      await job.updateProgress(50);

      // Store bible
      await this.bibleModel.create({ bookId, data: bible });

      // Split chapters with AI
      const boundaries = await this.ai.splitChapters(text);
      await job.updateProgress(80);

      // Get primary entity names for anchor generation
      const primaryEntities = (bible.entities || [])
        .filter((e: any) => e.role === 'primary' || e.type === 'character')
        .map((e: any) => e.name)
        .slice(0, 5); // limit to 5 anchors

      // Compose the rest of the pipeline
      await this.pipelineService.composePipelineAfterAnalysis(
        bookId,
        primaryEntities,
        boundaries.length,
      );

      await job.updateProgress(100);
      this.logger.log(`Book ${bookId} analyzed: ${boundaries.length} chapters, ${primaryEntities.length} entities`);

      return { bookId, chapterCount: boundaries.length, entityCount: primaryEntities.length };
    } catch (err: any) {
      this.logger.error(`Failed to analyze book ${bookId}: ${err.message}`);
      await this.bookModel.update(
        { status: BookStatus.ERROR, errorMsg: err.message },
        { where: { id: bookId } },
      );
      throw err;
    }
  }
}
