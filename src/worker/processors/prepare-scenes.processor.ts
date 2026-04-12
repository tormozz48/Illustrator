import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Chapter } from '../../common/database/models/chapter.model';
import { Scene } from '../../common/database/models/scene.model';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';

@Injectable()
export class PrepareScenesProcessor {
  private readonly logger = new Logger(PrepareScenesProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @InjectModel(Scene) private sceneModel: typeof Scene,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
  ) {}

  async handle(job: BullJob<{ bookId: string; chapterNumbers: number[]; batchIndex: number }>) {
    const { bookId, chapterNumbers, batchIndex } = job.data;
    this.logger.log(`[prepare-scenes] Starting batch ${batchIndex} for book ${bookId}: chapters [${chapterNumbers.join(', ')}]`);

    try {
      await this.bookModel.update({ status: BookStatus.PREPARING_SCENES }, { where: { id: bookId } });
      this.logger.log(`[prepare-scenes] Book ${bookId}: status → PREPARING_SCENES`);

      const bible = await this.bibleModel.findOne({ where: { bookId } });
      if (!bible) throw new Error(`Bible not found for book ${bookId}`);

      const chapters = await this.chapterModel.findAll({
        where: { bookId, number: chapterNumbers },
        order: [['number', 'ASC']],
      });
      this.logger.log(`[prepare-scenes] Book ${bookId} batch ${batchIndex}: found ${chapters.length} chapters in DB (requested ${chapterNumbers.length})`);

      if (chapters.length === 0) {
        this.logger.warn(`[prepare-scenes] Book ${bookId} batch ${batchIndex}: ⚠ no chapters found — split may not have completed yet`);
      }

      let processed = 0;
      let totalScenes = 0;
      for (const chapter of chapters) {
        try {
          this.logger.log(`[prepare-scenes] Book ${bookId}: finding key scenes for chapter ${chapter.number} (${chapter.content.length} chars)...`);
          const scenes = await this.ai.findKeyScenes(chapter.content, bible.data, chapter.number);

          for (const scene of scenes) {
            await this.sceneModel.create({
              chapterId: chapter.id,
              paragraphIndex: scene.paragraph_index,
              description: scene.description,
              visualDescription: scene.visual_description,
              entities: scene.entities,
              setting: scene.setting,
              mood: scene.mood,
            });
          }
          totalScenes += scenes.length;

          this.logger.log(`[prepare-scenes] Book ${bookId}: chapter ${chapter.number} → ${scenes.length} scenes created`);
        } catch (err: any) {
          this.logger.error(`[prepare-scenes] Book ${bookId}: chapter ${chapter.number} failed — ${err.message}`, err.stack);
          // Continue with other chapters in the batch
        }

        processed++;
        await job.updateProgress(Math.round((processed / chapters.length) * 100));
      }

      this.logger.log(`[prepare-scenes] Book ${bookId} batch ${batchIndex}: ✔ complete — ${processed} chapters, ${totalScenes} scenes`);
      return { bookId, batchIndex, processedChapters: processed };
    } catch (err: any) {
      this.logger.error(`[prepare-scenes] Book ${bookId} batch ${batchIndex}: ✘ FAILED — ${err.message}`, err.stack);
      throw err;
    }
  }
}
