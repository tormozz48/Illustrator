import { Table, Column, Model, DataType, ForeignKey, BelongsTo, CreatedAt } from 'sequelize-typescript';
import { Book } from './book.model';

@Table({ tableName: 'bibles', underscored: true, updatedAt: false })
export class Bible extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Book)
  @Column({ type: DataType.STRING(10), unique: true })
  declare bookId: string;

  @Column({ type: DataType.JSONB })
  declare data: any;

  @CreatedAt
  declare createdAt: Date;

  @BelongsTo(() => Book)
  declare book: Book;
}
