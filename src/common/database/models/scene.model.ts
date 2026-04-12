import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Chapter } from './chapter.model';
import { SceneVariant } from './scene-variant.model';

@Table({ tableName: 'scenes', underscored: true, timestamps: false })
export class Scene extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Chapter)
  @Column({ type: DataType.INTEGER })
  declare chapterId: number;

  @Column({ type: DataType.INTEGER })
  declare paragraphIndex: number;

  @Column({ type: DataType.TEXT })
  declare description: string;

  @Column({ type: DataType.TEXT })
  declare visualDescription: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare entities: any;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare setting: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare mood: string;

  @BelongsTo(() => Chapter)
  declare chapter: Chapter;

  @HasMany(() => SceneVariant)
  declare variants: SceneVariant[];
}
