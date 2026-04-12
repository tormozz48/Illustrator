const API_BASE = '/api';

export interface Book {
  id: string;
  title: string | null;
  author: string | null;
  status: string;
  errorMsg: string | null;
  createdAt: string;
}

export interface ChapterGridItem {
  id: number;
  number: number;
  title: string | null;
  status: string;
  sceneCount: number;
  contentPreview: string;
}

export interface SceneDetail {
  id: number;
  paragraphIndex: number;
  description: string;
  visualDescription: string;
  entities: string[];
  setting: string;
  mood: string;
  variants: VariantDetail[];
}

export interface VariantDetail {
  id: number;
  imageUrl: string;
  score: number | null;
  selected: boolean;
  width: number | null;
  height: number | null;
}

export interface ChapterDetail {
  id: number;
  number: number;
  title: string | null;
  content: string;
  status: string;
  scenes: SceneDetail[];
}

export interface BookProgress {
  total: number;
  draft: number;
  editing: number;
  illustrated: number;
}

export interface ReaderData {
  book: { id: string; title: string | null; author: string | null };
  chapters: {
    number: number;
    title: string | null;
    content: string;
    illustrations: { paragraphIndex: number; imageUrl: string }[];
  }[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

export async function uploadBook(file: File, title?: string, author?: string): Promise<Book> {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);
  if (author) formData.append('author', author);
  return request<Book>('/books', { method: 'POST', body: formData });
}

export async function listBooks(): Promise<Book[]> {
  return request<Book[]>('/books');
}

export async function getBook(id: string): Promise<Book> {
  return request<Book>(`/books/${id}`);
}

export async function getBookProgress(id: string): Promise<BookProgress> {
  return request<BookProgress>(`/books/${id}/progress`);
}

export async function listChapters(bookId: string): Promise<ChapterGridItem[]> {
  return request<ChapterGridItem[]>(`/books/${bookId}/chapters`);
}

export async function getChapterDetail(bookId: string, num: number): Promise<ChapterDetail> {
  return request<ChapterDetail>(`/books/${bookId}/chapters/${num}`);
}

export async function generateVariants(
  bookId: string,
  chapterNum: number,
  sceneIds: number[],
  variantCount: number,
): Promise<{ jobId: string; status: string }> {
  return request(`/books/${bookId}/chapters/${chapterNum}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene_ids: sceneIds, variant_count: variantCount }),
  });
}

export async function saveChapter(
  bookId: string,
  chapterNum: number,
  selections: { sceneId: number; variantId: number }[],
): Promise<{ status: string }> {
  return request(`/books/${bookId}/chapters/${chapterNum}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selections }),
  });
}

export async function editChapter(bookId: string, chapterNum: number): Promise<{ status: string }> {
  return request(`/books/${bookId}/chapters/${chapterNum}/edit`, { method: 'POST' });
}

export async function publishBook(id: string): Promise<{ status: string }> {
  return request(`/books/${id}/publish`, { method: 'POST' });
}

export async function deleteBook(id: string): Promise<void> {
  return request(`/books/${id}`, { method: 'DELETE' });
}

export async function getReaderData(id: string): Promise<ReaderData> {
  return request<ReaderData>(`/books/${id}/reader-data`);
}
