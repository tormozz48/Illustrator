import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppConfigModule } from '../common/config/config.module';
import { DatabaseModule } from '../common/database/database.module';
import { QueueModule } from '../common/queue/queue.module';
import { StorageModule } from '../common/storage/storage.module';
import { AiModule } from '../common/ai/ai.module';
import { BooksModule } from './books/books.module';
import { ChaptersModule } from './chapters/chapters.module';
import { BooksGateway } from './gateway/books.gateway';
import { ImageGenerationEventsListener } from './gateway/image-generation.listener';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    QueueModule,
    StorageModule,
    AiModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'public'),
      exclude: ['/api/{*path}'],
    }),
    BooksModule,
    ChaptersModule,
  ],
  controllers: [HealthController],
  providers: [BooksGateway, ImageGenerationEventsListener],
  exports: [BooksGateway],
})
export class ApiModule {}
