/**
 * Typed API client — thin wrappers over fetch that talk to the Worker.
 *
 * In development: Vite proxies /api → localhost:8787 (see vite.config.ts).
 * In production:  set VITE_API_BASE to the deployed Worker URL, e.g.
 *                 https://illustrator-api.<account>.workers.dev
 *
 * If VITE_API_BASE is not set the client uses a relative path (same-origin),
 * which works when Pages and the Worker share a custom domain.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export interface Book {
  id: string;
  title: string;
  author: string | null;
  status:
    | 'pending'
    | 'analyzing'
    | 'splitting'
    | 'anchoring'
    | 'preparing_scenes'
    | 'ready'
    | 'publishing'
    | 'done'
    | 'error';
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterMeta {
  id: number;
  number: number;
  title: string;
  insert_after_para: number | null;
  has_illustration: number;
}

export interface ChapterGridItem {
  id: number;
  number: number;
  title: string;
  content_preview: string;
  status: 'draft' | 'editing' | 'illustrated';
  scene_count: number;
}

export interface VariantDetail {
  id: number;
  image_url: string;
  validation_score: number | null;
  selected: boolean;
  created_at: string;
}

export interface SceneDetail {
  id: number;
  chapter_id: number;
  ordinal: number;
  description: string;
  visual_description: string;
  entities: string[];
  setting: string;
  mood: string;
  insert_after_para: number;
  selected: boolean;
  variants: VariantDetail[];
}

export interface ChapterDetail {
  id: number;
  number: number;
  title: string;
  content: string;
  status: 'draft' | 'editing' | 'illustrated';
  scenes: SceneDetail[];
}

export interface BookProgress {
  id: string;
  status: string;
  total_chapters: number;
  illustrated_chapters: number;
  editing_chapters: number;
  draft_chapters: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function apiJsonFetch<T>(
  path: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  /** Upload a book file and start illustration */
  uploadBook(
    file: File,
    title?: string,
    author?: string
  ): Promise<Pick<Book, 'id' | 'title' | 'status'>> {
    const form = new FormData();
    form.append('file', file);
    if (title) {
      form.append('title', title);
    }
    if (author) {
      form.append('author', author);
    }
    return apiFetch('/api/books', { method: 'POST', body: form });
  },

  /** List all books */
  listBooks(): Promise<Book[]> {
    return apiFetch('/api/books');
  },

  /** Get a single book's status */
  getBook(id: string): Promise<Book> {
    return apiFetch(`/api/books/${id}`);
  },

  /** List chapters for a book */
  listChapters(bookId: string): Promise<ChapterMeta[]> {
    return apiFetch(`/api/books/${bookId}/chapters`);
  },

  /** Get book progress with chapter status counts */
  getBookProgress(id: string): Promise<BookProgress> {
    return apiFetch(`/api/books/${id}/progress`);
  },

  /** List chapters for book detail grid view */
  listChaptersGrid(bookId: string): Promise<ChapterGridItem[]> {
    return apiFetch(`/api/books/${bookId}/chapters`);
  },

  /** Get detailed chapter with scenes and variants */
  getChapter(bookId: string, num: number): Promise<ChapterDetail> {
    return apiFetch(`/api/books/${bookId}/chapters/${num}`);
  },

  /** Generate images for selected scenes in a chapter */
  generateImages(
    bookId: string,
    num: number,
    body: { scene_ids: number[]; variant_count: number }
  ): Promise<{ results: { scene_id: number; variants: VariantDetail[] }[] }> {
    return apiJsonFetch(`/api/books/${bookId}/chapters/${num}/generate`, 'POST', body);
  },

  /** Save chapter with selected variants for scenes */
  saveChapter(
    bookId: string,
    num: number,
    body: { selections: { scene_id: number; variant_id: number | null }[] }
  ): Promise<ChapterDetail> {
    return apiJsonFetch(`/api/books/${bookId}/chapters/${num}/save`, 'POST', body);
  },

  /** Set chapter to editing mode */
  editChapter(bookId: string, num: number): Promise<ChapterDetail> {
    return apiFetch(`/api/books/${bookId}/chapters/${num}/edit`, { method: 'POST' });
  },

  /** Publish the book (assemble and finalize) */
  publishBook(id: string): Promise<{ html_r2_key: string }> {
    return apiFetch(`/api/books/${id}/publish`, { method: 'POST' });
  },

  /** URL to stream a variant image */
  variantImgUrl(bookId: string, variantId: number): string {
    return `${BASE}/api/books/${bookId}/chapters/variants/${variantId}/img`;
  },

  /** URL to stream a chapter's illustration image */
  chapterImgUrl(bookId: string, chapterNum: number): string {
    return `${BASE}/api/books/${bookId}/chapters/${chapterNum}/img`;
  },

  /** Delete a book and all its data */
  deleteBook(id: string): Promise<{ deleted: boolean }> {
    return apiFetch(`/api/books/${id}`, { method: 'DELETE' });
  },
};
