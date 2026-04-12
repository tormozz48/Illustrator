import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { Book } from '../../common/database/models/book.model';
import { Bible } from '../../common/database/models/bible.model';
import { Chapter } from '../../common/database/models/chapter.model';
import { Scene } from '../../common/database/models/scene.model';
import { SceneVariant } from '../../common/database/models/scene-variant.model';
import { Anchor } from '../../common/database/models/anchor.model';
import { Job } from '../../common/database/models/job.model';

@Module({
  imports: [SequelizeModule.forFeature([Book, Bible, Chapter, Scene, SceneVariant, Anchor, Job])],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
