/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full URL of the deployed Cloudflare Worker, e.g. https://illustrator-api.example.workers.dev */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
