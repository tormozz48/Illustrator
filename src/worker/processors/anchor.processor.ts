import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job as BullJob } from 'bullmq';
import { Jimp } from 'jimp';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Anchor } from '../../common/database/models/anchor.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { AI_PROVIDER, IAIProvider } from '../../common/ai/ai-provider.interface';

@Injectable()
export class AnchorProcessor {
  private readonly logger = new Logger(AnchorProcessor.name);

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Anchor) private anchorModel: typeof Anchor,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider,
  ) {}

  async handle(job: BullJob<{ bookId: string; entityName: string }>) {
    const { bookId, entityName } = job.data;
    this.logger.log(`[anchor] Starting anchor portrait for "${entityName}" in book ${bookId}`);

    try {
      await this.bookModel.update({ status: BookStatus.ANCHORING }, { where: { id: bookId } });
      this.logger.log(`[anchor] Book ${bookId}: status → ANCHORING`);

      const bible = await this.bibleModel.findOne({ where: { bookId } });
      if (!bible) throw new Error(`Bible not found for book ${bookId}`);

      const entity = (bible.data.entities || []).find((e: any) => e.name === entityName);
      if (!entity) throw new Error(`Entity ${entityName} not found in bible`);

      const prompt = `Create a detailed character portrait of ${entityName}. ${entity.visual_appearance || entity.physical_description}. ${bible.data.style_guide?.art_style || ''}. Full-body or bust portrait, neutral background, suitable as a reference sheet.`;

      // Generate image
      this.logger.log(`[anchor] Book ${bookId}: generating image for "${entityName}"...`);
      const rawImage = await this.ai.generateImage(prompt);
      await job.updateProgress(60);
      this.logger.log(`[anchor] Book ${bookId}: raw image received for "${entityName}" (${rawImage.length} bytes)`);

      // Process with Jimp (resize, convert to png)
      const image = await Jimp.read(rawImage);
      this.logger.log(`[anchor] Book ${bookId}: image loaded ${image.width}x${image.height}`);
      if (image.width > 800) {
        image.resize({ w: 800 });
        this.logger.log(`[anchor] Book ${bookId}: resized to 800px width`);
      }
      const pngBuffer = await image.getBuffer('image/png');

      // Store in MinIO
      const safeName = entityName.replace(/\s+/g, '_');
      const storageKey = `books/${bookId}/anchors/${safeName}.png`;
      await this.storage.upload(storageKey, pngBuffer, 'image/png');
      this.logger.log(`[anchor] Book ${bookId}: uploaded to "${storageKey}" (${pngBuffer.length} bytes)`);

      // Save to DB
      await this.anchorModel.create({ bookId, name: entityName, storageKey });

      await job.updateProgress(100);
      this.logger.log(`[anchor] Book ${bookId}: ✔ anchor for "${entityName}" complete`);
      return { bookId, entityName, storageKey };
    } catch (err: any) {
      this.logger.error(`[anchor] Book ${bookId}: ✘ anchor for "${entityName}" failed — ${err.message}`, err.stack);
      // Don't fail the whole pipeline for a single anchor
      return { bookId, entityName, error: err.message };
    }
  }
}
