import type { Workflow } from '@cloudflare/workers-types';

/** Cloudflare Worker bindings — keep in sync with wrangler.jsonc */
export interface Env {
  // R2
  BOOKS_BUCKET: R2Bucket;

  // D1
  DB: D1Database;

  // KV
  CACHE: KVNamespace;

  // Queue
  ILLUSTRATE_QUEUE: Queue<IllustrateJobMessage>;

  // Workflow
  ILLUSTRATE_WORKFLOW: Workflow;

  // Secrets
  GEMINI_API_KEY: string;
}

/** Message pushed onto the Cloudflare Queue */
export interface IllustrateJobMessage {
  bookId: string;
  r2Key: string;
}

/** D1 row shapes */
export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  status: string;
  error_msg: string | null;
  r2_key: string | null;
  html_r2_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterRow {
  id: number;
  book_id: string;
  number: number;
  title: string;
  content: string;
  created_at: string;
}

export interface AnchorRow {
  chapter_id: number;
  insert_after_para: number;
  created_at: string;
}

export interface IllustrationRow {
  chapter_id: number;
  r2_key: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

export interface BibleRow {
  book_id: string;
  data: string; // JSON
  created_at: string;
}
