import { Table, Column, Model, DataType, ForeignKey, BelongsTo, CreatedAt } from 'sequelize-typescript';
import { Scene } from './scene.model';

@Table({ tableName: 'scene_variants', underscored: true, updatedAt: false })
export class SceneVariant extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Scene)
  @Column({ type: DataType.INTEGER })
  declare sceneId: number;

  @Column({ type: DataType.STRING(500) })
  declare storageKey: string;

  @Column({ type: DataType.FLOAT, allowNull: true })
  declare score: number | null;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare selected: boolean;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare width: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare height: number | null;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => Scene)
  declare scene: Scene;
}
