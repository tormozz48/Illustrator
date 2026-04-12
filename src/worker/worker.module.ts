import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AppConfigModule } from '../common/config/config.module';
import { DatabaseModule } from '../common/database/database.module';
import { QueueModule } from '../common/queue/queue.module';
import { StorageModule } from '../common/storage/storage.module';
import { AiModule } from '../common/ai/ai.module';
import { Book } from '../common/database/models/book.model';
import { Bible } from '../common/database/models/bible.model';
import { Chapter } from '../common/database/models/chapter.model';
import { Scene } from '../common/database/models/scene.model';
import { SceneVariant } from '../common/database/models/scene-variant.model';
import { Anchor } from '../common/database/models/anchor.model';
import { Job } from '../common/database/models/job.model';
import { AnalyzeProcessor } from './processors/analyze.processor';
import { SplitProcessor } from './processors/split.processor';
import { AnchorProcessor } from './processors/anchor.processor';
import { PrepareScenesProcessor } from './processors/prepare-scenes.processor';
import { FinalizeProcessor } from './processors/finalize.processor';
import { GenerateImagesProcessor } from './processors/generate-images.processor';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    QueueModule,
    StorageModule,
    AiModule,
    SequelizeModule.forFeature([Book, Bible, Chapter, Scene, SceneVariant, Anchor, Job]),
  ],
  providers: [
    AnalyzeProcessor,
    SplitProcessor,
    AnchorProcessor,
    PrepareScenesProcessor,
    FinalizeProcessor,
    GenerateImagesProcessor,
    PipelineService,
  ],
})
export class WorkerModule {}
