import { Table, Column, Model, DataType, ForeignKey, BelongsTo, CreatedAt } from 'sequelize-typescript';
import { Book } from './book.model';

@Table({ tableName: 'anchors', underscored: true, updatedAt: false })
export class Anchor extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Book)
  @Column({ type: DataType.STRING(10) })
  declare bookId: string;

  @Column({ type: DataType.STRING(200) })
  declare name: string;

  @Column({ type: DataType.STRING(500) })
  declare storageKey: string;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => Book)
  declare book: Book;
}
