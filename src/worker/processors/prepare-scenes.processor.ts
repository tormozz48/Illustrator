import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Chapter } from '../../common/database/models/chapter.model';
import { Scene } from '../../common/database/models/scene.model';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';
import { QUEUE_BOOK_PIPELINE } from '../../common/constants';

@Processor(QUEUE_BOOK_PIPELINE, { name: 'prepare-scenes' })
export class PrepareScenesProcessor extends WorkerHost {
  private readonly logger = new Logger(PrepareScenesProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @InjectModel(Scene) private sceneModel: typeof Scene,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ bookId: string; chapterNumbers: number[]; batchIndex: number }>) {
    const { bookId, chapterNumbers, batchIndex } = job.data;
    this.logger.log(`Preparing scenes for book ${bookId}, batch ${batchIndex}: chapters ${chapterNumbers.join(', ')}`);

    try {
      await this.bookModel.update({ status: BookStatus.PREPARING_SCENES }, { where: { id: bookId } });

      const bible = await this.bibleModel.findOne({ where: { bookId } });
      if (!bible) throw new Error(`Bible not found for book ${bookId}`);

      const chapters = await this.chapterModel.findAll({
        where: { bookId, number: chapterNumbers },
        order: [['number', 'ASC']],
      });

      let processed = 0;
      for (const chapter of chapters) {
        try {
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

          this.logger.log(`Chapter ${chapter.number}: ${scenes.length} scenes prepared`);
        } catch (err: any) {
          this.logger.error(`Failed to prepare scenes for chapter ${chapter.number}: ${err.message}`);
          // Continue with other chapters in the batch
        }

        processed++;
        await job.updateProgress(Math.round((processed / chapters.length) * 100));
      }

      return { bookId, batchIndex, processedChapters: processed };
    } catch (err: any) {
      this.logger.error(`Failed to prepare scenes batch ${batchIndex}: ${err.message}`);
      throw err;
    }
  }
}
