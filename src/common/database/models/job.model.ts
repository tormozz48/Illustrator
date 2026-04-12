import { Table, Column, Model, DataType, ForeignKey, BelongsTo, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Book } from './book.model';

@Table({ tableName: 'jobs', underscored: true })
export class Job extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Book)
  @Column({ type: DataType.STRING(10) })
  declare bookId: string;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare bullmqId: string | null;

  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Book)
  declare book: Book;
}
