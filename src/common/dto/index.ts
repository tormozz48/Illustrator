export { UploadBookDto } from './upload-book.dto';
export { GenerateVariantsDto } from './generate-variants.dto';
export { SaveChapterDto } from './save-chapter.dto';

export interface BookProgressDto {
  total: number;
  draft: number;
  editing: number;
  illustrated: number;
}

export interface ChapterGridItem {
  id: number;
  number: number;
  title: string | null;
  status: string;
  sceneCount: number;
  contentPreview: string;
}

export interface ReaderChapter {
  number: number;
  title: string | null;
  content: string;
  illustrations: {
    paragraphIndex: number;
    imageUrl: string;
  }[];
}
