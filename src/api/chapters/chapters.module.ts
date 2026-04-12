import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import { Chapter } from '../../common/database/models/chapter.model';
import { Scene } from '../../common/database/models/scene.model';
import { SceneVariant } from '../../common/database/models/scene-variant.model';
import { Anchor } from '../../common/database/models/anchor.model';
import { Bible } from '../../common/database/models/bible.model';

@Module({
  imports: [SequelizeModule.forFeature([Chapter, Scene, SceneVariant, Anchor, Bible])],
  controllers: [ChaptersController],
  providers: [ChaptersService],
})
export class ChaptersModule {}
