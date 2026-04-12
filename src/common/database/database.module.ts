import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Book } from './models/book.model';
import { Bible } from './models/bible.model';
import { Chapter } from './models/chapter.model';
import { Scene } from './models/scene.model';
import { SceneVariant } from './models/scene-variant.model';
import { Anchor } from './models/anchor.model';
import { Job } from './models/job.model';

const models = [Book, Bible, Chapter, Scene, SceneVariant, Anchor, Job];

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'postgres',
        uri: config.get<string>('DATABASE_URL'),
        models,
        autoLoadModels: true,
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development' ? console.log : false,
      }),
    }),
    SequelizeModule.forFeature(models),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
