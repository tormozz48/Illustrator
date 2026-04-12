import { Injectable, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectQueue } from '@nestjs/bullmq';
import { FlowProducer } from 'bullmq';
import { Queue } from 'bullmq';
import { Book, BookStatus } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Chapter, ChapterStatus } from '../../common/database/models/chapter.model';
import { Scene } from '../../common/database/models/scene.model';
import { SceneVariant } from '../../common/database/models/scene-variant.model';
import { Anchor } from '../../common/database/models/anchor.model';
import { Job } from '../../common/database/models/job.model';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { QUEUE_BOOK_PIPELINE, JOB_ANALYZE, JOB_SPLIT, JOB_ANCHOR, JOB_PREPARE_SCENES, JOB_FINALIZE } from '../../common/constants';
import { ConfigService } from '@nestjs/config';

// Use dynamic import for nanoid (ESM-only package)
const nanoid = () => import('nanoid').then(m => m.nanoid(10));

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private flowProducer: FlowProducer;

  constructor(
    @InjectModel(Book) private bookModel: typeof Book,
    @InjectModel(Bible) private bibleModel: typeof Bible,
    @InjectModel(Chapter) private chapterModel: typeof Chapter,
    @InjectModel(Scene) private sceneModel: typeof Scene,
    @InjectModel(SceneVariant) private variantModel: typeof SceneVariant,
    @InjectModel(Anchor) private anchorModel: typeof Anchor,
    @InjectModel(Job) private jobModel: typeof Job,
    @Inject(STORAGE_SERVICE) private storage: IStorageService,
    @InjectQueue(QUEUE_BOOK_PIPELINE) private pipelineQueue: Queue,
    private config: ConfigService,
  ) {
    this.flowProducer = new FlowProducer({
      connection: {
        host: config.get('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6379),
      },
    });
  }

  async uploadBook(file: Express.Multer.File, title?: string, author?: string) {
    const id = await nanoid();
    const storageKey = `books/${id}/source.txt`;

    // Store file in MinIO
    await this.storage.upload(storageKey, file.buffer, 'text/plain');

    // Create book record
    const book = await this.bookModel.create({
      id,
      title: title || null,
      author: author || null,
      status: BookStatus.PENDING,
      storageKey,
    });

    // Create job and enqueue pipeline flow
    // The flow is built as: analyze -> split -> anchors (parallel) -> prepare-scenes (batched) -> finalize
    // We start with just analyze; the worker will compose the full flow after analysis
    const flow = await this.flowProducer.add({
      name: JOB_ANALYZE,
      queueName: QUEUE_BOOK_PIPELINE,
      data: { bookId: id },
    });

    await this.jobModel.create({
      bookId: id,
      bullmqId: flow.job.id,
      status: 'queued',
    });

    this.logger.log(`Book ${id} uploaded, pipeline queued`);
    return book;
  }

  async listBooks() {
    return this.bookModel.findAll({ order: [['createdAt', 'DESC']] });
  }

  async getBook(id: string) {
    return this.bookModel.findByPk(id);
  }

  async getBookProgress(id: string) {
    const chapters = await this.chapterModel.findAll({ where: { bookId: id } });
    const total = chapters.length;
    const draft = chapters.filter(c => c.status === ChapterStatus.DRAFT).length;
    const editing = chapters.filter(c => c.status === ChapterStatus.EDITING).length;
    const illustrated = chapters.filter(c => c.status === ChapterStatus.ILLUSTRATED).length;
    return { total, draft, editing, illustrated };
  }

  async getBookReaderData(id: string) {
    const book = await this.bookModel.findByPk(id);
    if (!book) throw new HttpException('Book not found', HttpStatus.NOT_FOUND);

    const chapters = await this.chapterModel.findAll({
      where: { bookId: id },
      order: [['number', 'ASC']],
      include: [{
        model: Scene,
        include: [{
          model: SceneVariant,
          where: { selected: true },
          required: false,
        }],
      }],
    });

    return {
      book: { id: book.id, title: book.title, author: book.author },
      chapters: chapters.map(ch => ({
        number: ch.number,
        title: ch.title,
        content: ch.content,
        illustrations: (ch.scenes || [])
          .filter(s => s.variants?.some(v => v.selected))
          .map(s => {
            const variant = s.variants!.find(v => v.selected)!;
            return {
              paragraphIndex: s.paragraphIndex,
              imageUrl: `/api/books/${id}/chapters/variants/${variant.id}/img`,
            };
          }),
      })),
    };
  }

  async publishBook(id: string) {
    const book = await this.bookModel.findByPk(id);
    if (!book) throw new HttpException('Book not found', HttpStatus.NOT_FOUND);

    // Check all chapters are illustrated
    const progress = await this.getBookProgress(id);
    if (progress.illustrated < progress.total) {
      throw new HttpException('Not all chapters are illustrated', HttpStatus.BAD_REQUEST);
    }

    await book.update({ status: BookStatus.DONE });
    return { status: 'done' };
  }

  async deleteBook(id: string) {
    const book = await this.bookModel.findByPk(id);
    if (!book) throw new HttpException('Book not found', HttpStatus.NOT_FOUND);

    // Delete all storage objects
    await this.storage.deletePrefix(`books/${id}/`);

    // Cascade delete handles DB records
    await book.destroy();
    return { deleted: true };
  }
}
