import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ChaptersService } from './chapters.service';
import { GenerateVariantsDto } from '../../common/dto/generate-variants.dto';
import { SaveChapterDto } from '../../common/dto/save-chapter.dto';

@Controller('api/books/:bookId/chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Get()
  async listChapters(@Param('bookId') bookId: string) {
    return this.chaptersService.listChapters(bookId);
  }

  @Get(':num')
  async getChapter(
    @Param('bookId') bookId: string,
    @Param('num') num: string,
  ) {
    const chapter = await this.chaptersService.getChapterDetail(bookId, parseInt(num, 10));
    if (!chapter) throw new HttpException('Chapter not found', HttpStatus.NOT_FOUND);
    return chapter;
  }

  @Post(':num/generate')
  async generateVariants(
    @Param('bookId') bookId: string,
    @Param('num') num: string,
    @Body() dto: GenerateVariantsDto,
  ) {
    return this.chaptersService.enqueueImageGeneration(
      bookId,
      parseInt(num, 10),
      dto.scene_ids,
      dto.variant_count,
    );
  }

  @Post(':num/save')
  async saveChapter(
    @Param('bookId') bookId: string,
    @Param('num') num: string,
    @Body() dto: SaveChapterDto,
  ) {
    return this.chaptersService.saveChapterSelections(
      bookId,
      parseInt(num, 10),
      dto.selections,
    );
  }

  @Post(':num/edit')
  async editChapter(
    @Param('bookId') bookId: string,
    @Param('num') num: string,
  ) {
    return this.chaptersService.markChapterEditing(bookId, parseInt(num, 10));
  }

  @Get('variants/:variantId/img')
  async getVariantImage(
    @Param('variantId') variantId: string,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.chaptersService.getVariantImage(parseInt(variantId, 10));
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }
}
