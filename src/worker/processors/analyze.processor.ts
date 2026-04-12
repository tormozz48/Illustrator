import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';
import { PipelineService } from '../pipeline.service';

@Injectable()
export class AnalyzeProcessor {
  private readonly logger = new Logger(AnalyzeProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
    private pipelineService: PipelineService,
  ) {}

  async handle(job: BullJob<{ bookId: string }>) {
    const { bookId } = job.data;
    this.logger.log(`[analyze] Starting analysis for book ${bookId}`);

    try {
      // Update status
      await this.bookModel.update({ status: BookStatus.ANALYZING }, { where: { id: bookId } });
      this.logger.log(`[analyze] Book ${bookId}: status → ANALYZING`);

      // Read book text from storage
      const book = await this.bookModel.findByPk(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);

      this.logger.log(`[analyze] Book ${bookId}: downloading text from storage key="${book.storageKey}"`);
      const textBuffer = await this.storage.download(book.storageKey);
      const text = textBuffer.toString('utf-8');
      this.logger.log(`[analyze] Book ${bookId}: text loaded (${text.length} chars)`);

      // Analyze with AI
      this.logger.log(`[analyze] Book ${bookId}: calling AI analyzeBook...`);
      await job.updateProgress(10);
      const bible = await this.ai.analyzeBook(text);
      await job.updateProgress(50);
      this.logger.log(`[analyze] Book ${bookId}: AI analysis complete — ${(bible.entities || []).length} entities, style=${bible.style_guide?.art_style || 'none'}`);

      // Store bible
      await this.bibleModel.create({ bookId, data: bible });
      this.logger.log(`[analyze] Book ${bookId}: bible saved to DB`);

      // Split chapters with AI
      this.logger.log(`[analyze] Book ${bookId}: calling AI splitChapters...`);
      const boundaries = await this.ai.splitChapters(text);
      await job.updateProgress(80);
      this.logger.log(`[analyze] Book ${bookId}: AI found ${boundaries.length} chapter boundaries`);

      // Get primary entity names for anchor generation
      const primaryEntities = (bible.entities || [])
        .filter((e: any) => e.role === 'primary' || e.type === 'character')
        .map((e: any) => e.name)
        .slice(0, 5); // limit to 5 anchors
      this.logger.log(`[analyze] Book ${bookId}: primary entities for anchors: [${primaryEntities.join(', ')}]`);

      // Compose the rest of the pipeline
      this.logger.log(`[analyze] Book ${bookId}: composing pipeline flow (${boundaries.length} chapters, ${primaryEntities.length} anchors)...`);
      await this.pipelineService.composePipelineAfterAnalysis(
        bookId,
        primaryEntities,
        boundaries.length,
      );

      await job.updateProgress(100);
      this.logger.log(`[analyze] Book ${bookId}: ✔ analysis complete, pipeline flow enqueued`);

      return { bookId, chapterCount: boundaries.length, entityCount: primaryEntities.length };
    } catch (err: any) {
      this.logger.error(`[analyze] Book ${bookId}: ✘ FAILED — ${err.message}`, err.stack);
      await this.bookModel.update(
        { status: BookStatus.ERROR, errorMsg: err.message },
        { where: { id: bookId } },
      );
      throw err;
    }
  }
}
