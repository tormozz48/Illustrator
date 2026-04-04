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

  // Workers AI — used by CloudflareAIClient in the workflow
  AI: Ai;

  // Secrets
  // GEMINI_API_KEY is no longer used in production; kept optional for CLI dev
  GEMINI_API_KEY?: string;
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
