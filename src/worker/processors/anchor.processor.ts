import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Jimp } from 'jimp';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Anchor } from '../../common/database/models/anchor.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';
import { QUEUE_BOOK_PIPELINE } from '../../common/constants';

@Processor(QUEUE_BOOK_PIPELINE, { name: 'anchor' })
export class AnchorProcessor extends WorkerHost {
  private readonly logger = new Logger(AnchorProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Anchor) private anchorModel: typeof Anchor,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ bookId: string; entityName: string }>) {
    const { bookId, entityName } = job.data;
    this.logger.log(`Generating anchor portrait for ${entityName} in book ${bookId}`);

    try {
      await this.bookModel.update({ status: BookStatus.ANCHORING }, { where: { id: bookId } });

      const bible = await this.bibleModel.findOne({ where: { bookId } });
      if (!bible) throw new Error(`Bible not found for book ${bookId}`);

      const entity = (bible.data.entities || []).find((e: any) => e.name === entityName);
      if (!entity) throw new Error(`Entity ${entityName} not found in bible`);

      const prompt = `Create a detailed character portrait of ${entityName}. ${entity.visual_appearance || entity.physical_description}. ${bible.data.style_guide?.art_style || ''}. Full-body or bust portrait, neutral background, suitable as a reference sheet.`;

      // Generate image
      const rawImage = await this.ai.generateImage(prompt);
      await job.updateProgress(60);

      // Process with Jimp (resize, convert to webp)
      const image = await Jimp.read(rawImage);
      if (image.width > 800) {
        image.resize({ w: 800 });
      }
      const webpBuffer = await image.getBuffer('image/png');

      // Store in MinIO
      const safeName = entityName.replace(/\s+/g, '_');
      const storageKey = `books/${bookId}/anchors/${safeName}.png`;
      await this.storage.upload(storageKey, webpBuffer, 'image/png');

      // Save to DB
      await this.anchorModel.create({ bookId, name: entityName, storageKey });

      await job.updateProgress(100);
      this.logger.log(`Anchor portrait for ${entityName} saved`);
      return { bookId, entityName, storageKey };
    } catch (err: any) {
      this.logger.error(`Failed to generate anchor for ${entityName}: ${err.message}`);
      // Don't fail the whole pipeline for a single anchor
      return { bookId, entityName, error: err.message };
    }
  }
}
