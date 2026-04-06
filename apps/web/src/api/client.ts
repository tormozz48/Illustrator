/**
 * Typed API client — thin wrappers over fetch that talk to the Worker.
 *
 * In development: Vite proxies /api → localhost:8787 (see vite.config.ts).
 * In production:  set VITE_API_BASE to the deployed Worker URL.
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

export interface ReaderIllustration {
  insertAfterParagraph: number;
  imageUrl: string;
}

export interface ReaderChapter {
  number: number;
  title: string;
  content: string;
  illustrations: ReaderIllustration[];
}

export interface ReaderData {
  id: string;
  title: string;
  author: string | null;
  chapters: ReaderChapter[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function apiJsonFetch<T>(path: string, method: string, body: Record<string, unknown>): Promise<T> {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  uploadBook(
    file: File,
    title?: string,
    author?: string
  ): Promise<Pick<Book, 'id' | 'title' | 'status'>> {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (author) form.append('author', author);
    return apiFetch('/api/books', { method: 'POST', body: form });
  },

  listBooks(): Promise<Book[]> {
    return apiFetch('/api/books');
  },

  getBook(id: string): Promise<Book> {
    return apiFetch(`/api/books/${id}`);
  },

  getBookProgress(id: string): Promise<BookProgress> {
    return apiFetch(`/api/books/${id}/progress`);
  },

  listChaptersGrid(bookId: string): Promise<ChapterGridItem[]> {
    return apiFetch(`/api/books/${bookId}/chapters`);
  },

  getChapter(bookId: string, num: number): Promise<ChapterDetail> {
    return apiFetch(`/api/books/${bookId}/chapters/${num}`);
  },

  getBookReaderData(bookId: string): Promise<ReaderData> {
    return apiFetch(`/api/books/${bookId}/reader-data`);
  },

  saveChapter(
    bookId: string,
    num: number,
    body: { selections: { scene_id: number; variant_id: number | null }[] }
  ): Promise<ChapterDetail> {
    return apiJsonFetch(`/api/books/${bookId}/chapters/${num}/save`, 'POST', body);
  },

  editChapter(bookId: string, num: number): Promise<ChapterDetail> {
    return apiFetch(`/api/books/${bookId}/chapters/${num}/edit`, { method: 'POST' });
  },

  publishBook(id: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/books/${id}/publish`, { method: 'POST' });
  },

  variantImgUrl(bookId: string, variantId: number): string {
    return `${BASE}/api/books/${bookId}/chapters/variants/${variantId}/img`;
  },

  deleteBook(id: string): Promise<{ deleted: boolean }> {
    return apiFetch(`/api/books/${id}`, { method: 'DELETE' });
  },
};

export type GenerateStreamEvent =
  | { type: 'variant'; scene_id: number; variant: VariantDetail }
  | { type: 'scene_done'; scene_id: number }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Stream image generation results as they arrive (SSE via fetch). */
export async function* generateImagesStream(
  bookId: string,
  num: number,
  body: { scene_ids: number[]; variant_count: number }
): AsyncGenerator<GenerateStreamEvent> {
  const response = await fetch(`${BASE}/api/books/${bookId}/chapters/${num}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const b = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const dataLine = event.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        yield JSON.parse(dataLine.slice(6)) as GenerateStreamEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
