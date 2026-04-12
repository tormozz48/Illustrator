import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Job as BullJob } from "bullmq";
import { Jimp } from "jimp";
import { Bible } from "../../common/database/models/bible.model";
import { Chapter } from "../../common/database/models/chapter.model";
import { Scene } from "../../common/database/models/scene.model";
import { SceneVariant } from "../../common/database/models/scene-variant.model";
import { Anchor } from "../../common/database/models/anchor.model";
import {
  STORAGE_SERVICE,
  IStorageService,
} from "../../common/storage/storage.interface";
import {
  AI_PROVIDER,
  IAIProvider,
} from "../../common/ai/ai-provider.interface";
import { QUEUE_IMAGE_GENERATION } from "../../common/constants";
import { buildImagePrompt } from "../../prompts";

@Processor(QUEUE_IMAGE_GENERATION)
export class GenerateImagesProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateImagesProcessor.name);

  constructor(
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @InjectModel(Scene) private sceneModel: typeof Scene,
    @InjectModel(SceneVariant) private variantModel: typeof SceneVariant,
    @InjectModel(Anchor) private anchorModel: typeof Anchor,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @Inject(AI_PROVIDER) private ai: IAIProvider
  ) {
    super();
  }

  async process(
    job: BullJob<{
      bookId: string;
      chapterNum: number;
      sceneIds: number[];
      variantCount: number;
    }>
  ) {
    const { bookId, chapterNum, sceneIds, variantCount } = job.data;
    this.logger.log(
      `Generating images for book ${bookId}, chapter ${chapterNum}, ${sceneIds.length} scenes x ${variantCount} variants`
    );

    const bible = await this.bibleModel.findOne({ where: { bookId } });
    if (!bible) throw new Error(`Bible not found for book ${bookId}`);

    // Load anchor images for reference
    const anchors = await this.anchorModel.findAll({ where: { bookId } });
    const referenceImages: Buffer[] = [];
    for (const anchor of anchors) {
      try {
        const img = await this.storage.download(anchor.storageKey);
        referenceImages.push(img);
      } catch {
        // Skip if anchor image not available
      }
    }

    const scenes = await this.sceneModel.findAll({
      where: { id: sceneIds },
    });

    let totalWork = scenes.length * variantCount;
    let completed = 0;

    for (const scene of scenes) {
      for (let v = 0; v < variantCount; v++) {
        try {
          const prompt = buildImagePrompt(
            {
              visual_description: scene.visualDescription,
              setting: scene.setting || "",
              mood: scene.mood || "",
              entities: scene.entities || [],
            },
            bible.data
          );

          // Generate image
          const rawImage = await this.ai.generateImage(prompt, referenceImages);

          // Process with Jimp
          const image = await Jimp.read(rawImage);
          const width = image.width;
          const height = image.height;
          if (width > 800) {
            image.resize({ w: 800 });
          }
          const webpBuffer = await image.getBuffer("image/png");

          // Validate
          let score = 0.5;
          try {
            score = await this.ai.validateImage(webpBuffer, bible.data);
          } catch {
            // Use default score if validation fails
          }

          // Store
          const storageKey = `books/${bookId}/scenes/${scene.id}/variants/${Date.now()}_${v}.png`;
          await this.storage.upload(storageKey, webpBuffer, "image/png");

          // Save variant to DB
          const variant = await this.variantModel.create({
            sceneId: scene.id,
            storageKey,
            score,
            width: Math.min(width, 800),
            height,
          });

          completed++;
          await job.updateProgress({
            completed,
            total: totalWork,
            type: "variant",
            sceneId: scene.id,
            variant: {
              id: variant.id,
              imageUrl: `/api/books/${bookId}/chapters/variants/${variant.id}/img`,
              score,
              width: variant.width,
              height: variant.height,
            },
          });

          this.logger.log(
            `✅ [DEBUG] Variant ${v + 1}/${variantCount} for scene ${scene.id} generated (score: ${score.toFixed(2)}) - Progress event sent with variant.id=${variant.id}`
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to generate variant ${v + 1} for scene ${scene.id}: ${err.message}`
          );
          completed++;
          await job.updateProgress({
            completed,
            total: totalWork,
            type: "error",
            sceneId: scene.id,
            error: err.message,
          });
        }
      }
    }

    return {
      bookId,
      chapterNum,
      scenesProcessed: scenes.length,
      variantsGenerated: completed,
    };
  }
}
