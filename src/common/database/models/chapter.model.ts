import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Book } from './book.model';
import { Scene } from './scene.model';

export enum ChapterStatus {
  DRAFT = 'draft',
  EDITING = 'editing',
  ILLUSTRATED = 'illustrated',
}

@Table({ tableName: 'chapters', underscored: true })
export class Chapter extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Book)
  @Column({ type: DataType.STRING(10) })
  declare bookId: string;

  @Column({ type: DataType.INTEGER })
  declare number: number;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare title: string | null;

  @Column({ type: DataType.TEXT })
  declare content: string;

  @Column({ type: DataType.ENUM(...Object.values(ChapterStatus)), defaultValue: ChapterStatus.DRAFT })
  declare status: ChapterStatus;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Book)
  declare book: Book;

  @HasMany(() => Scene)
  declare scenes: Scene[];
}
