import { Table, Column, Model, DataType, HasMany, HasOne, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Chapter } from './chapter.model';
import { Bible } from './bible.model';
import { Anchor } from './anchor.model';
import { Job } from './job.model';

export enum BookStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  SPLITTING = 'splitting',
  ANCHORING = 'anchoring',
  PREPARING_SCENES = 'preparing_scenes',
  READY = 'ready',
  PUBLISHING = 'publishing',
  DONE = 'done',
  ERROR = 'error',
}

@Table({ tableName: 'books', underscored: true })
export class Book extends Model {
  @Column({ type: DataType.STRING(10), primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare title: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare author: string | null;

  @Column({ type: DataType.ENUM(...Object.values(BookStatus)), defaultValue: BookStatus.PENDING })
  declare status: BookStatus;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare errorMsg: string | null;

  @Column({ type: DataType.STRING(500) })
  declare storageKey: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @HasMany(() => Chapter)
  declare chapters: Chapter[];

  @HasOne(() => Bible)
  declare bible: Bible;

  @HasMany(() => Anchor)
  declare anchors: Anchor[];

  @HasMany(() => Job)
  declare jobs: Job[];
}
