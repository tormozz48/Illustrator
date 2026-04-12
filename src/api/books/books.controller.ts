import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BooksService } from './books.service';

@Controller('api/books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadBook(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; author?: string },
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }
    return this.booksService.uploadBook(file, body.title, body.author);
  }

  @Get()
  async listBooks() {
    return this.booksService.listBooks();
  }

  @Get(':id')
  async getBook(@Param('id') id: string) {
    const book = await this.booksService.getBook(id);
    if (!book) throw new HttpException('Book not found', HttpStatus.NOT_FOUND);
    return book;
  }

  @Get(':id/progress')
  async getProgress(@Param('id') id: string) {
    return this.booksService.getBookProgress(id);
  }

  @Get(':id/reader-data')
  async getReaderData(@Param('id') id: string) {
    return this.booksService.getBookReaderData(id);
  }

  @Post(':id/publish')
  async publishBook(@Param('id') id: string) {
    return this.booksService.publishBook(id);
  }

  @Delete(':id')
  async deleteBook(@Param('id') id: string) {
    return this.booksService.deleteBook(id);
  }
}
