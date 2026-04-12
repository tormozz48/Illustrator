import { Injectable, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Chapter, ChapterStatus } from '../../common/database/models/chapter.model';
import { Scene } from '../../common/database/models/scene.model';
import { SceneVariant } from '../../common/database/models/scene-variant.model';
import { Anchor } from '../../common/database/models/anchor.model';
import { Bible } from '../../common/database/models/bible.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { QUEUE_IMAGE_GENERATION, JOB_GENERATE_IMAGES } from '../../common/constants';
import { ChapterGridItem } from '../../common/dto';

@Injectable()
export class ChaptersService {
  private readonly logger = new Logger(ChaptersService.name);

  constructor(
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @InjectModel(Scene) private sceneModel: typeof Scene,
    @InjectModel(SceneVariant) private variantModel: typeof SceneVariant,
    @InjectModel(Anchor) private anchorModel: typeof Anchor,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @InjectQueue(QUEUE_IMAGE_GENERATION) private imageQueue: Queue,
  ) {}

  async listChapters(bookId: string): Promise<ChapterGridItem[]> {
    const chapters = await this.chapterModel.findAll({
      where: { bookId },
      order: [['number', 'ASC']],
      include: [{ model: Scene }],
    });

    return chapters.map(ch => ({
      id: ch.id,
      number: ch.number,
      title: ch.title,
      status: ch.status,
      sceneCount: ch.scenes?.length || 0,
      contentPreview: ch.content.slice(0, 200),
    }));
  }

  async getChapterDetail(bookId: string, chapterNum: number) {
    const chapter = await this.chapterModel.findOne({
      where: { bookId, number: chapterNum },
      include: [{
        model: Scene,
        include: [{ model: SceneVariant }],
      }],
    });

    if (!chapter) return null;

    return {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      content: chapter.content,
      status: chapter.status,
      scenes: (chapter.scenes || []).map(s => ({
        id: s.id,
        paragraphIndex: s.paragraphIndex,
        description: s.description,
        visualDescription: s.visualDescription,
        entities: s.entities,
        setting: s.setting,
        mood: s.mood,
        variants: (s.variants || []).map(v => ({
          id: v.id,
          imageUrl: `/api/books/${bookId}/chapters/variants/${v.id}/img`,
          score: v.score,
          selected: v.selected,
          width: v.width,
          height: v.height,
        })),
      })),
    };
  }

  async enqueueImageGeneration(
    bookId: string,
    chapterNum: number,
    sceneIds: number[],
    variantCount: number,
  ) {
    const chapter = await this.chapterModel.findOne({
      where: { bookId, number: chapterNum },
    });
    if (!chapter) throw new HttpException('Chapter not found', HttpStatus.NOT_FOUND);

    const job = await this.imageQueue.add(JOB_GENERATE_IMAGES, {
      bookId,
      chapterNum,
      sceneIds,
      variantCount,
    });

    this.logger.log(`Image generation job ${job.id} enqueued for book ${bookId} chapter ${chapterNum}`);
    return { jobId: job.id, status: 'queued' };
  }

  async saveChapterSelections(
    bookId: string,
    chapterNum: number,
    selections: { sceneId: number; variantId: number }[],
  ) {
    const chapter = await this.chapterModel.findOne({
      where: { bookId, number: chapterNum },
    });
    if (!chapter) throw new HttpException('Chapter not found', HttpStatus.NOT_FOUND);

    for (const sel of selections) {
      // Deselect all variants for this scene
      await this.variantModel.update(
        { selected: false },
        { where: { sceneId: sel.sceneId } },
      );
      // Select the chosen variant
      await this.variantModel.update(
        { selected: true },
        { where: { id: sel.variantId, sceneId: sel.sceneId } },
      );
    }

    await chapter.update({ status: ChapterStatus.ILLUSTRATED });
    return { status: 'saved' };
  }

  async markChapterEditing(bookId: string, chapterNum: number) {
    const chapter = await this.chapterModel.findOne({
      where: { bookId, number: chapterNum },
    });
    if (!chapter) throw new HttpException('Chapter not found', HttpStatus.NOT_FOUND);

    await chapter.update({ status: ChapterStatus.EDITING });
    return { status: 'editing' };
  }

  async getVariantImage(variantId: number) {
    const variant = await this.variantModel.findByPk(variantId);
    if (!variant) throw new HttpException('Variant not found', HttpStatus.NOT_FOUND);

    const buffer = await this.storage.download(variant.storageKey);
    return { buffer, contentType: 'image/webp' };
  }
}
