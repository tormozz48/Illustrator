# System Design: Illustrator SaaS on Cloudflare Platform

**Date:** 2026-04-03
**Status:** Proposal
**Author:** Andrii + Claude

---

## 1. Goals & Constraints

### Functional Requirements

- **Upload**: Users upload plain-text book files via a web interface
- **Process**: The pipeline transforms books into illustrated HTML (existing 5-stage pipeline)
- **Browse**: Users view a list of their illustrated books with status
- **Read**: Users open and read the finished illustrated HTML book in-browser
- **Cache**: All intermediate data (bible, chapters, images) is persisted and reusable

### Non-Functional Requirements

- Run entirely on Cloudflare's free tier for MVP
- Keep the core pipeline logic portable — testable and runnable locally without Cloudflare
- Use Cloudflare's npm tooling (`wrangler`, Miniflare) for local dev parity
- Stateless API workers; all state in D1/R2/KV
- Graceful failure: pipeline can resume from the last successful step

### Constraints

- **Free tier CPU**: Workers get 10ms CPU per invocation (network wait doesn't count)
- **Free tier requests**: 100K Worker requests/day
- **Queues**: 10K operations/day on free tier
- **D1**: 5 GB storage, limited daily reads/writes
- **R2**: 10 GB storage, 1M writes, 10M reads/month, zero egress
- **KV**: 1 GB storage, 100K reads/day, 1K writes/day
- **Workflows**: State retained 3 days on free tier
- **External subrequests**: 50 per Worker invocation on free tier

---

## 2. Cloudflare Services Selection

### Services We Use

| Service | Role | Why This Service |
|---------|------|------------------|
| **Pages** | Frontend hosting (React SPA) | Free, unlimited bandwidth, Git-connected deploys, preview URLs per branch |
| **Workers** | API backend (REST endpoints) | Lightweight request handling, binds to all other services |
| **Workflows** | Pipeline orchestration | Durable execution, automatic retry per step, state persistence between steps — perfect for the multi-stage LLM pipeline |
| **Queues** | Job dispatch | Decouples upload from processing, reliable delivery, dead-letter support |
| **D1** | Relational database | SQLite — stores books metadata, bible JSON, chapters, job state. Free 5 GB is generous for text data |
| **R2** | Object storage | Stores uploaded book files, generated images (PNG/JPEG), final HTML output. Zero egress = free reads from frontend |
| **KV** | Edge cache | Fast reads for bible data, style guides, and config. 100K reads/day is plenty for edge-cached lookups |

### Services We Considered But Deferred

| Service | Why Deferred |
|---------|-------------|
| **Durable Objects** | Workflows already use them under the hood. Direct use adds complexity without clear benefit at MVP |
| **Workers AI** | Offers FLUX.2 image generation (10K neurons/day free). Worth exploring post-MVP as a Gemini image-gen alternative — would eliminate external API calls for images |
| **Vectorize** | Vector DB for semantic search. Potential future feature (search scenes by description) but not needed for core pipeline |
| **Hyperdrive** | Connection pooling for external DBs. Not needed — we use D1 natively |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                         │
│                                                             │
│  ┌──────────┐     ┌──────────┐     ┌───────────────────┐   │
│  │  Pages   │────▶│  Worker  │────▶│     Queue         │   │
│  │ (React)  │     │  (API)   │     │  (job dispatch)   │   │
│  └──────────┘     └────┬─────┘     └────────┬──────────┘   │
│       │                │                     │              │
│       │           ┌────┴─────┐         ┌─────▼──────────┐  │
│       │           │    D1    │         │   Workflow      │  │
│       │           │ (SQLite) │◀────────│ (pipeline run)  │  │
│       │           └────┬─────┘         └──┬──┬──┬───────┘  │
│       │                │                  │  │  │           │
│       │           ┌────┴─────┐            │  │  │           │
│       │           │    KV    │◀───────────┘  │  │           │
│       │           │ (cache)  │               │  │           │
│       │           └──────────┘               │  │           │
│       │                                      │  │           │
│       │           ┌──────────┐               │  │           │
│       └──────────▶│    R2    │◀──────────────┘  │           │
│                   │ (files)  │                   │           │
│                   └──────────┘                   │           │
│                                                  │           │
└──────────────────────────────────────────────────┼───────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │   Gemini API     │
                                          │  (external LLM)  │
                                          └──────────────────┘
```

### Data Flow

```
User uploads book.txt
        │
        ▼
┌─────────────────┐
│ POST /api/books  │  Worker validates, stores file in R2,
│                  │  creates book record in D1,
│                  │  enqueues job to Queue
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Queue Consumer  │  Receives message, triggers Workflow instance
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Workflow: IllustrateBook                        │
│                                                  │
│  Step 1: read-book                               │
│    ├─ Fetch book.txt from R2                     │
│    ├─ Normalize text, extract title              │
│    └─ Save metadata to D1                        │
│                                                  │
│  Step 2: analyze-book                            │
│    ├─ Call Gemini → CharacterBible               │
│    ├─ Store bible JSON in D1                     │
│    └─ Cache bible in KV for fast access          │
│                                                  │
│  Step 3: split-chapters                          │
│    ├─ Call Gemini → chapter boundaries           │
│    ├─ Slice text locally                         │
│    └─ Store chapters in D1                       │
│                                                  │
│  Step 4: generate-anchors                        │
│    ├─ For each primary entity:                   │
│    │   ├─ Build anchor prompt                    │
│    │   ├─ Call Gemini → image                    │
│    │   └─ Store image in R2                      │
│    └─ Record anchor R2 keys in D1               │
│                                                  │
│  Step 5..N: illustrate-chapter (per chapter)     │
│    ├─ Find key scene (Gemini)                    │
│    ├─ Build image prompt                         │
│    ├─ Generate image (Gemini + anchor refs)      │
│    ├─ Validate image (Gemini vision)             │
│    ├─ Retry if score < 0.7 (up to 2x)           │
│    ├─ Optimize image (resize/compress)           │
│    └─ Store image in R2, update D1               │
│                                                  │
│  Step N+1: assemble-html                         │
│    ├─ Read all data from D1 + images from R2     │
│    ├─ Render Eta template → book.html            │
│    └─ Store final HTML in R2                     │
│                                                  │
│  Step N+2: finalize                              │
│    └─ Update book status → "completed" in D1     │
└─────────────────────────────────────────────────┘
         │
         ▼
User polls GET /api/books/:id → sees status "completed"
User opens GET /api/books/:id/read → served from R2
```

---

## 4. Component Deep Dive

### 4.1 Frontend — Cloudflare Pages

**Technology:** React SPA (Vite + React Router)

**Pages:**

- `/` — Landing page / upload form
- `/books` — List of user's books with status badges (queued, processing, completed, failed)
- `/books/:id` — Book detail (progress, bible preview, chapter list)
- `/books/:id/read` — Full illustrated book reader (HTML served from R2 via Worker)

**Deployment:** Git-connected to the monorepo. Pages builds the `apps/web` directory on push. Preview URLs generated per PR.

**API Communication:** All API calls go to the Workers backend at `/api/*`. In production, this is routed via a custom domain or Cloudflare's service bindings. In development, Vite proxies to `wrangler dev`.

### 4.2 API Worker

**Endpoints:**

```
POST   /api/books              Upload a book file
GET    /api/books              List all books (with status)
GET    /api/books/:id          Get book details + pipeline status
GET    /api/books/:id/read     Serve the final illustrated HTML from R2
GET    /api/books/:id/bible    Get the visual bible (from KV cache → D1 fallback)
DELETE /api/books/:id          Delete book and all associated data

GET    /api/books/:id/chapters           List chapters with status
GET    /api/books/:id/chapters/:num      Get chapter detail
GET    /api/books/:id/chapters/:num/img  Serve chapter illustration from R2

GET    /api/jobs/:id           Get job status + current stage
```

**Bindings (wrangler.jsonc):**

```jsonc
{
  "name": "illustrator-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-01",
  "bindings": [
    // R2 bucket for file storage
    { "type": "r2_bucket", "name": "BUCKET", "bucket_name": "illustrator-files" },
    // D1 database
    { "type": "d1", "name": "DB", "database_name": "illustrator-db" },
    // KV namespace for caching
    { "type": "kv_namespace", "name": "CACHE", "id": "..." },
    // Queue producer
    { "type": "queue", "name": "JOB_QUEUE", "queue_name": "illustrator-jobs" },
    // Workflow binding
    { "type": "workflow", "name": "PIPELINE", "class_name": "IllustrateBookWorkflow" }
  ]
}
```

**Why a separate Worker (not Pages Functions):** The API Worker needs bindings to Queues, Workflows, R2, D1, and KV. While Pages Functions can bind to these, a standalone Worker gives us independent deployment, clearer separation of concerns, and easier local testing with `wrangler dev`.

### 4.3 Pipeline Workflow

**Service:** Cloudflare Workflows (durable execution engine)

Workflows is the natural fit for the illustration pipeline because it provides exactly what we need: multi-step execution with automatic retry, state persistence between steps, and resume-from-failure. Each step emits state that is durably stored, so if a step fails (e.g., Gemini returns a 429), the Workflow retries that step without re-running earlier stages.

**Step Design:**

Each pipeline stage becomes a Workflow step. Steps are sequential (not parallel) in the MVP. This is a deliberate trade-off:

- **Pro:** Simpler architecture, no coordination overhead, fits free tier limits
- **Pro:** LLM rate limits are the real bottleneck anyway — parallel calls often get throttled
- **Con:** Slower wall-clock time per book vs. CLI's p-map parallelism
- **Mitigation:** For a SaaS, processing is async — the user doesn't wait. Sequential is acceptable.

**Step-by-step pseudocode:**

```typescript
import { Workflow, WorkflowStep } from "cloudflare:workers";

export class IllustrateBookWorkflow extends Workflow {
  async run(event: WorkflowEvent, step: WorkflowStep) {
    const { bookId } = event.payload;

    // Step 1: Read book from R2
    const bookData = await step.do("read-book", async () => {
      const obj = await this.env.BUCKET.get(`books/${bookId}/source.txt`);
      const rawText = await obj.text();
      return { rawText, title: extractTitle(rawText) };
    });

    // Step 2: Analyze book → Visual Bible
    const bible = await step.do("analyze-book", {
      retries: { limit: 3, backoff: "exponential" }
    }, async () => {
      const client = new GeminiClient(this.env.GEMINI_API_KEY);
      const bible = await client.analyzeBook(bookData.rawText);
      // Persist to D1
      await this.env.DB.prepare(
        "INSERT INTO bibles (book_id, data) VALUES (?, ?)"
      ).bind(bookId, JSON.stringify(bible)).run();
      // Cache in KV
      await this.env.CACHE.put(`bible:${bookId}`, JSON.stringify(bible));
      return bible;
    });

    // Step 3: Split chapters
    const chapters = await step.do("split-chapters", {
      retries: { limit: 3, backoff: "exponential" }
    }, async () => {
      const client = new GeminiClient(this.env.GEMINI_API_KEY);
      const chapters = await client.splitChapters(bookData.rawText);
      // Persist each chapter to D1
      for (const ch of chapters) {
        await this.env.DB.prepare(
          "INSERT INTO chapters (id, book_id, number, title, content, status) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), bookId, ch.number, ch.title, ch.content, "pending").run();
      }
      return chapters;
    });

    // Step 4: Generate anchor images for primary entities
    const primaryEntities = bible.entities.filter(e => e.importance === "primary");
    for (const entity of primaryEntities) {
      await step.do(`anchor-${entity.name}`, {
        retries: { limit: 2, backoff: "exponential" }
      }, async () => {
        const client = new GeminiClient(this.env.GEMINI_API_KEY);
        const prompt = buildAnchorPrompt(entity, bible.styleGuide);
        const imageBuffer = await client.generateImage(prompt);
        const key = `books/${bookId}/anchors/${entity.name}.png`;
        await this.env.BUCKET.put(key, imageBuffer);
        await this.env.DB.prepare(
          "INSERT INTO anchors (id, book_id, entity_name, r2_key) VALUES (?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), bookId, entity.name, key).run();
      });
    }

    // Steps 5..N: Illustrate each chapter
    for (const chapter of chapters) {
      await step.do(`illustrate-ch-${chapter.number}`, {
        retries: { limit: 2, backoff: "exponential" }
      }, async () => {
        const client = new GeminiClient(this.env.GEMINI_API_KEY);
        // ... findKeyScene, generateImage, validateImage, optimizeImage ...
        // Store image in R2, update chapter in D1
      });
    }

    // Step N+1: Assemble HTML
    await step.do("assemble", async () => {
      // Read all chapters + images, render template, store in R2
      const html = await assembleBook(this.env, bookId, bookData.title, bible, chapters);
      await this.env.BUCKET.put(`books/${bookId}/output.html`, html);
    });

    // Step N+2: Finalize
    await step.do("finalize", async () => {
      await this.env.DB.prepare(
        "UPDATE books SET status = 'completed', updated_at = ? WHERE id = ?"
      ).bind(new Date().toISOString(), bookId).run();
    });
  }
}
```

**Key Properties of Workflows for Our Use Case:**

1. **Automatic retry**: If Gemini returns 429 or 500, the step retries with exponential backoff
2. **State persistence**: If the Worker crashes after step 3, it resumes from step 4
3. **Step isolation**: Each step can make external API calls (Gemini), write to R2/D1, independently
4. **Visibility**: We can query workflow status to show progress in the UI
5. **Timeout handling**: Steps that exceed wall time are retried, not lost

### 4.4 Queue — Job Dispatch

**Queue:** `illustrator-jobs`

**Message Format:**

```typescript
interface JobMessage {
  bookId: string;
  action: "illustrate";
}
```

**Why a Queue between upload and Workflow?**

- Decouples the upload API response time from pipeline startup
- Provides natural rate limiting (consumers process at their own pace)
- Dead-letter queue support for failed messages
- On free tier (10K ops/day), each book = 3 ops (1 write + 1 read + 1 delete) ≈ 3,300 books/day capacity from the queue alone

### 4.5 Database — D1 (SQLite)

**Schema:**

```sql
-- Book metadata
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
    -- uploaded | queued | processing | completed | failed
  source_r2_key TEXT NOT NULL,
  output_r2_key TEXT,
  workflow_id TEXT,
  chapter_count INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Visual Bible (one per book)
CREATE TABLE bibles (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  data TEXT NOT NULL,  -- full CharacterBible JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chapters
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  key_scene TEXT,           -- KeyScene JSON
  illustration_r2_key TEXT, -- R2 key for the optimized JPEG
  illustration_prompt TEXT, -- the final prompt used
  validation_score REAL,
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | illustrating | completed | failed | skipped
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chapters_book ON chapters(book_id, number);

-- Anchor reference images
CREATE TABLE anchors (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_anchors_book ON anchors(book_id);

-- Pipeline job tracking
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  workflow_instance_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
    -- queued | running | completed | failed
  current_step TEXT,        -- e.g. "illustrate-ch-5"
  total_steps INTEGER,
  completed_steps INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_book ON jobs(book_id);
```

**Why D1 over KV for structured data:**

- Relational queries (list books by status, get chapters in order)
- Transactional writes (update chapter status + increment completed_steps atomically)
- SQL filtering, sorting, pagination — essential for the book list UI
- 5 GB free storage is more than enough for text metadata

**D1 for text content, R2 for binary blobs.** Chapter text goes in D1 (queryable, relational). Images go in R2 (large binary objects, served directly to browser).

### 4.6 Object Storage — R2

**Bucket:** `illustrator-files`

**Key Structure:**

```
books/
  {bookId}/
    source.txt              # uploaded book file
    output.html             # final illustrated HTML
    anchors/
      {entityName}.png      # anchor reference images
    chapters/
      {number}.jpg          # optimized chapter illustrations
      {number}_original.png # pre-optimization (optional, for re-processing)
```

**Access Patterns:**

- **Write**: Worker (upload), Workflow (images, HTML output)
- **Read**: Worker API (serve to frontend), Workflow (assembly step reads images for base64 embedding)
- **Delete**: Cascade when user deletes a book

**Why R2:**

- Zero egress fees — serving images to the frontend costs nothing
- S3-compatible API — can use standard tooling
- 10 GB free storage ≈ hundreds of illustrated books (each book ~10-50 MB of images)

### 4.7 Cache — Workers KV

**Namespace:** `illustrator-cache`

**Cached Data:**

| Key Pattern | Value | TTL | Purpose |
|------------|-------|-----|---------|
| `bible:{bookId}` | CharacterBible JSON | 7 days | Fast bible lookups during illustration + for UI display |
| `style:{bookId}` | StyleGuide JSON | 7 days | Quick access to style prefix for prompts |
| `book:{bookId}:status` | Status string | 60s | Polling-friendly status without hitting D1 every time |

**Why KV alongside D1:**

- KV reads are ~10ms at the edge (globally replicated)
- D1 reads are ~30-50ms (single region with read replicas)
- For hot-path reads (status polling, bible lookups during illustration), KV is worth it
- 100K reads/day free is generous for this use case

---

## 5. Monorepo Structure

```
illustrator/
├── packages/
│   └── core/                        # Shared pipeline logic (portable)
│       ├── src/
│       │   ├── gemini.ts            # GeminiClient (all LLM calls)
│       │   ├── prompts/             # All prompt templates
│       │   │   ├── analyzeBook.ts
│       │   │   ├── splitChapters.ts
│       │   │   ├── findKeyScene.ts
│       │   │   └── validateImage.ts
│       │   ├── schemas/             # Zod schemas (bible, chapters, etc.)
│       │   ├── utils/               # jsonRepair, llmRetry, truncationGuard, sliceChapters
│       │   ├── pipeline/            # Pure pipeline functions (no Cloudflare deps)
│       │   │   ├── reader.ts
│       │   │   ├── analyzer.ts
│       │   │   ├── splitter.ts
│       │   │   ├── illustrator.ts
│       │   │   └── assembler.ts
│       │   └── templates/
│       │       └── book.eta
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── web/                         # React SPA (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Home.tsx
│   │   │   │   ├── BookList.tsx
│   │   │   │   ├── BookDetail.tsx
│   │   │   │   └── BookReader.tsx
│   │   │   ├── components/
│   │   │   ├── api/                 # API client (fetch wrappers)
│   │   │   └── App.tsx
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── api/                         # Workers API backend
│   │   ├── src/
│   │   │   ├── index.ts             # Router (Hono or itty-router)
│   │   │   ├── routes/
│   │   │   │   ├── books.ts
│   │   │   │   ├── chapters.ts
│   │   │   │   └── jobs.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts          # Future: user auth
│   │   │   └── queue.ts             # Queue consumer handler
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   │
│   └── pipeline/                    # Workflow definition
│       ├── src/
│       │   ├── workflow.ts          # IllustrateBookWorkflow class
│       │   └── steps/              # Individual step implementations
│       │       ├── readBook.ts
│       │       ├── analyzeBook.ts
│       │       ├── splitChapters.ts
│       │       ├── generateAnchors.ts
│       │       ├── illustrateChapter.ts
│       │       ├── assembleHtml.ts
│       │       └── finalize.ts
│       ├── wrangler.jsonc
│       └── package.json
│
├── apps/cli/                        # Original CLI (preserved)
│   ├── src/
│   │   └── index.ts                 # Commander CLI, imports from @illustrator/core
│   ├── package.json
│   └── tsconfig.json
│
├── migrations/                      # D1 schema migrations
│   ├── 0001_initial.sql
│   └── 0002_add_indexes.sql
│
├── package.json                     # Workspace root (npm workspaces)
├── turbo.json                       # Turborepo config (optional)
└── wrangler.jsonc                   # Shared Cloudflare config
```

### Key Design Principle: Portable Core

The `packages/core` package has **zero Cloudflare dependencies**. It contains the pure pipeline logic: LLM calls, prompt templates, schemas, image processing, HTML assembly. Both the CLI app (`apps/cli`) and the Cloudflare Workflow (`apps/pipeline`) import from it.

This means:

- **Local testing**: Run `packages/core` functions directly with Node.js, no Cloudflare emulation needed
- **CLI preserved**: `apps/cli` works exactly as before, importing from `@illustrator/core`
- **Workflow is a thin wrapper**: `apps/pipeline` just orchestrates core functions with Cloudflare bindings (R2 reads/writes, D1 persistence)
- **Swap providers easily**: Core doesn't know about R2 or D1 — it works with `Buffer` and returns data

---

## 6. npm Packages & Tooling

### Cloudflare Packages

| Package | Purpose |
|---------|---------|
| `wrangler` | CLI for local dev (`wrangler dev`), deployment (`wrangler deploy`), D1 migrations, R2 management |
| `@cloudflare/workers-types` | TypeScript types for Workers runtime APIs (R2, D1, KV, etc.) |
| `@cloudflare/vitest-pool-workers` | Run Vitest tests inside the Workers runtime with real bindings |
| `miniflare` | Local simulator for all Cloudflare services (bundled with wrangler, but can be used standalone) |
| `@cloudflare/vite-plugin` | Vite plugin for Pages + Workers integration in dev mode |

### Application Packages

| Package | Purpose |
|---------|---------|
| `hono` | Lightweight web framework for Workers (routing, middleware, validation). ~14KB. Popular in CF ecosystem |
| `zod` | Schema validation (already used in core) |
| `eta` | Template engine (already used for HTML assembly) |
| `p-map` | Concurrency control (used in CLI, not needed in Workflow but kept in core) |
| `jimp` | Image processing (resize/compress). Works in Workers runtime |

### Local Development

```bash
# Start everything locally
npm dev

# Under the hood:
# 1. apps/web: vite dev server (port 5173)
# 2. apps/api: wrangler dev (port 8787) — Miniflare simulates R2, D1, KV, Queues
# 3. apps/pipeline: wrangler dev — Miniflare runs Workflows locally

# Vite proxies /api/* to wrangler on 8787
```

**Miniflare provides local simulators for:**
- R2 → local filesystem directory
- D1 → local SQLite file
- KV → local SQLite-backed KV
- Queues → in-process message passing
- Workflows → local durable execution

This means `wrangler dev` gives you a near-production environment locally with zero cloud dependencies. You can upload a book, watch it process through the workflow, and read the result — all on localhost.

---

## 7. Image Processing Considerations

### The CPU Time Challenge

On the free tier, Workers have 10ms CPU time per invocation. Image processing (resize to 800px, JPEG compress) typically takes 50-200ms of CPU time. This is a problem for regular Workers.

**Solution: Process images inside Workflow steps.**

Workflow steps run on Durable Objects infrastructure with more relaxed limits. CPU time in Workflows doesn't include time spent waiting on API calls or I/O, so the bulk of each step (waiting on Gemini) is "free." The actual image processing CPU fits within the step budget.

### jimp Compatibility Warning

**jimp may not work in the Cloudflare Workers runtime (workerd).** Libraries that rely on Node.js native APIs face compatibility issues on the edge. While jimp v1.x is mostly pure JavaScript, some codecs may fail.

**Recommended alternatives:**

1. **Photon (WASM)** — High-performance Rust image processing compiled to WebAssembly. Works natively in Workers. Supports resize, crop, format conversion. This is the recommended approach for edge image processing.
2. **@cf-wasm/photon** — Community package wrapping Photon for Cloudflare Workers.
3. **Cloudflare Image Resizing** — Built-in service, transforms images on-the-fly via URL parameters. No code needed, but requires a paid plan or specific setup.
4. **Request correct dimensions from Gemini** — Ask the image generation API to produce images at the target size, eliminating the need for post-processing entirely.

**Recommendation:** Use **Photon (WASM)** as the primary image processing library. Keep jimp in `packages/core` for CLI use (where Node.js is available), and use Photon in `apps/pipeline` for the Cloudflare Workflow. Abstract the image optimization behind an interface so the core pipeline doesn't care which library is used:

```typescript
// packages/core/src/types.ts
interface ImageOptimizer {
  resize(buffer: Uint8Array, maxWidth: number): Promise<Uint8Array>;
  toJpeg(buffer: Uint8Array, quality: number): Promise<Uint8Array>;
}

// apps/cli uses JimpOptimizer
// apps/pipeline uses PhotonOptimizer
```

### Image Storage Strategy

- **During illustration**: Store optimized JPEG in R2 (`books/{id}/chapters/{num}.jpg`)
- **During assembly**: Read images from R2, base64-encode into HTML (same as current approach)
- **For the reader UI**: Alternatively, serve images separately via R2 URLs instead of embedding base64. This reduces HTML file size and leverages R2's zero-egress serving.

**Recommendation:** For the SaaS version, switch from base64-embedded images to R2-served images with `<img src>` pointing to R2 URLs. This:
- Reduces HTML file size dramatically (from ~50MB to ~50KB)
- Enables lazy loading of images
- Allows image caching at the CDN edge
- Makes the reader page load instantly (text first, images stream in)

---

## 8. API Design

### Router: Hono

Hono is the de-facto standard for Cloudflare Workers. It's lightweight (~14KB), fully typed, and has built-in middleware for validation, CORS, and error handling.

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";

type Env = {
  BUCKET: R2Bucket;
  DB: D1Database;
  CACHE: KVNamespace;
  JOB_QUEUE: Queue;
  PIPELINE: Workflow;
};

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

// Upload a book
app.post("/api/books", zValidator("form", uploadSchema), async (c) => {
  const file = c.req.valid("form").file;
  const bookId = crypto.randomUUID();

  // Store in R2
  await c.env.BUCKET.put(`books/${bookId}/source.txt`, file);

  // Create DB record
  await c.env.DB.prepare(
    "INSERT INTO books (id, title, status, source_r2_key) VALUES (?, ?, ?, ?)"
  ).bind(bookId, "Untitled", "queued", `books/${bookId}/source.txt`).run();

  // Enqueue for processing
  await c.env.JOB_QUEUE.send({ bookId, action: "illustrate" });

  return c.json({ id: bookId, status: "queued" }, 201);
});

// List books
app.get("/api/books", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, title, status, chapter_count, created_at FROM books ORDER BY created_at DESC"
  ).all();
  return c.json(result.results);
});

// Get book detail with progress
app.get("/api/books/:id", async (c) => {
  const bookId = c.req.param("id");
  const book = await c.env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(bookId).first();
  if (!book) return c.json({ error: "Not found" }, 404);

  // Get chapter progress
  const progress = await c.env.DB.prepare(
    "SELECT status, COUNT(*) as count FROM chapters WHERE book_id = ? GROUP BY status"
  ).bind(bookId).all();

  return c.json({ ...book, progress: progress.results });
});

// Serve illustrated book
app.get("/api/books/:id/read", async (c) => {
  const bookId = c.req.param("id");
  const obj = await c.env.BUCKET.get(`books/${bookId}/output.html`);
  if (!obj) return c.json({ error: "Not ready" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": "text/html" },
  });
});

// Serve chapter image directly from R2
app.get("/api/books/:id/chapters/:num/img", async (c) => {
  const { id, num } = c.req.param();
  const obj = await c.env.BUCKET.get(`books/${id}/chapters/${num}.jpg`);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export default app;
```

---

## 9. Free Tier Capacity Estimate

### Per-Book Resource Usage

| Resource | Per Book | Calculation |
|----------|---------|-------------|
| **R2 storage** | ~20 MB | 1 source (~500 KB) + ~15 images (~1 MB each) + 1 HTML (~2 MB) |
| **R2 Class A ops** (writes) | ~20 | 1 source + ~5 anchors + ~15 chapter images + 1 HTML |
| **R2 Class B ops** (reads) | ~40 | Reads during assembly + user reads |
| **D1 writes** | ~50 | 1 book + 1 bible + ~15 chapters + ~5 anchors + ~30 status updates |
| **D1 reads** | ~100 | Progress checks, chapter lookups, bible reads |
| **KV writes** | ~5 | Bible cache, style cache, status cache |
| **KV reads** | ~20 | Bible lookups during illustration, status polling |
| **Queue ops** | ~3 | 1 write + 1 read + 1 delete |
| **Worker requests** | ~30 | Upload + status polls + final read |
| **External API calls** | ~40 | 1 analyze + 1 split + ~5 anchors + ~15×(scene + image + validate) |

### Free Tier Monthly Capacity

| Resource | Free Limit | Per Book | Max Books/Month |
|----------|-----------|----------|----------------|
| R2 storage | 10 GB | 20 MB | ~500 (total stored) |
| R2 Class A | 1M/month | 20 | ~50,000 |
| R2 Class B | 10M/month | 40 | ~250,000 |
| D1 storage | 5 GB | ~1 MB text | ~5,000 |
| KV reads | 100K/day | 20 | ~5,000/day |
| Queue ops | 10K/day | 3 | ~3,300/day |
| Worker requests | 100K/day | 30 | ~3,300/day |
| Workflow steps | ~unlimited* | ~25 | N/A |

**Bottleneck:** The practical limit is Gemini API rate limits and cost, not Cloudflare free tier. For a 15-chapter book making ~40 Gemini calls, the Cloudflare free tier comfortably handles **50-100 books/day**. The Gemini free tier (~15 RPM for Flash) limits you to roughly **5-10 books/day**.

---

## 10. Trade-Off Analysis

### Decision 1: Sequential vs. Parallel Chapter Processing

| | Sequential (Chosen for MVP) | Parallel (Future) |
|--|---|---|
| **Architecture** | Single Workflow, loop over chapters | Workflow fans out to Queue, Durable Object coordinates |
| **Complexity** | Low — linear step progression | High — need coordination, completion tracking, error aggregation |
| **Speed per book** | ~15-30 min (15 chapters) | ~5-10 min (15 chapters, concurrency 3) |
| **Free tier fit** | Excellent — minimal queue/worker usage | Tight — more queue ops, more concurrent workers |
| **Resume behavior** | Natural — Workflow resumes at failed chapter | Complex — need to track which chapters completed |

**Decision:** Start sequential. Add parallel fan-out in Phase 2 when user demand justifies the complexity.

### Decision 2: Base64 Embedded Images vs. R2-Served Images

| | Base64 in HTML (Current CLI) | R2 URLs (Recommended for SaaS) |
|--|---|---|
| **HTML file size** | ~50 MB (15 chapters) | ~50 KB |
| **Page load** | Slow — entire file must download | Fast — text loads instantly, images lazy-load |
| **Offline support** | Full — single self-contained file | None without service worker |
| **R2 reads** | 1 large read | 1 small read + N image reads (cached) |
| **CDN caching** | Hard to cache (huge file) | Images cached individually at edge |
| **Download option** | Naturally downloadable | Need a "download" endpoint that assembles base64 version |

**Decision:** Use R2-served images for the web reader. Offer a "Download as single HTML" button that assembles the base64 version on demand (via a Worker endpoint).

### Decision 3: D1 vs. Durable Objects for State

| | D1 (Chosen) | Durable Objects SQLite |
|--|---|---|
| **Query model** | Global SQL database | Per-object SQLite (each book = 1 DO) |
| **Cross-book queries** | Natural — `SELECT * FROM books` | Impossible — must query each DO individually |
| **List/filter books** | Easy — SQL WHERE/ORDER BY | Need a separate index (D1 or KV) anyway |
| **Transaction scope** | Per-database | Per-object |
| **Free tier** | 5 GB shared | 1 GB total |

**Decision:** D1 for all structured data. Durable Objects add complexity without benefit when you need cross-entity queries (book list, global search).

### Decision 4: Hono vs. itty-router vs. Raw Workers

| | Hono (Chosen) | itty-router | Raw fetch handler |
|--|---|---|
| **Size** | ~14 KB | ~1 KB | 0 KB |
| **TypeScript** | Excellent, first-class | Good | Manual |
| **Middleware** | Rich ecosystem (CORS, auth, validation, logging) | Minimal | DIY |
| **Zod integration** | `@hono/zod-validator` built-in | Manual | Manual |
| **CF community** | De facto standard | Popular but less maintained | — |

**Decision:** Hono. The ergonomics and middleware ecosystem are worth 14 KB.

### Decision 5: Workers AI (FLUX.2) vs. External Gemini for Images

| | Gemini Image Gen (Current) | Workers AI FLUX.2 |
|--|---|---|
| **Latency** | Higher — external API call | Lower — runs on CF edge |
| **Cost** | Gemini free tier limits | 10K neurons/day free |
| **Quality** | Good (Gemini 2.5 Flash) | Good (FLUX.2 Schnell) |
| **Anchor references** | Supported — send PNG refs with prompt | Not supported — text-only prompts |
| **Consistency** | Strong — anchor images enforce visual consistency | Weaker — no reference image support |

**Decision:** Keep Gemini for MVP. The anchor reference image feature is critical for visual consistency across chapters. Evaluate Workers AI FLUX.2 as a fallback or cost optimization later.

---

## 11. Local Development Story

### Running Locally

```bash
# 1. Clone and install
git clone <repo>
cd illustrator
npm install

# 2. Set up environment
cp .env.example .env
# Add GEMINI_API_KEY

# 3. Run D1 migrations locally
npm --filter api run db:migrate:local

# 4. Start all services
npm dev
# This runs concurrently:
#   - Vite dev server (frontend) → http://localhost:5173
#   - Wrangler dev (API + Queue + Workflow) → http://localhost:8787
#   - Miniflare simulates R2, D1, KV, Queues locally
```

### Testing the Core Pipeline Directly

```bash
# Run the CLI directly (no Cloudflare involved)
npm --filter cli run dev -- generate book.txt --concurrency 3

# Run core unit tests
npm --filter core test

# Run integration tests against Miniflare
npm --filter api test
npm --filter pipeline test
```

### Deployment

```bash
# Deploy everything
npm deploy

# Under the hood:
#   1. npm --filter web run build && wrangler pages deploy apps/web/dist
#   2. wrangler deploy --config apps/api/wrangler.jsonc
#   3. wrangler deploy --config apps/pipeline/wrangler.jsonc
#   4. wrangler d1 migrations apply illustrator-db
```

---

## 12. Future Considerations

### Phase 2: Parallel Chapter Processing

When sequential processing becomes a user pain point, add fan-out:

1. Workflow step "fan-out" enqueues all chapters to a `chapter-illustration` Queue
2. Queue consumer Workers process chapters independently
3. A Durable Object per book tracks chapter completion
4. When all chapters complete, the DO triggers the assembly Workflow step

### Phase 3: User Authentication

- **Cloudflare Access** or **Auth0** for user authentication
- Add `user_id` column to `books` table
- API middleware validates JWT and scopes queries to the user

### Phase 4: Workers AI Integration

- Use FLUX.2 for image generation (reduce external API dependency)
- Use Llama for text analysis (reduce Gemini dependency)
- Hybrid approach: Gemini for high-quality analysis, Workers AI for image gen

### Phase 5: Advanced Features

- **EPUB/PDF export** — assemble from the same data in D1/R2
- **Collaborative editing** — let users adjust the bible, re-illustrate specific chapters
- **Style transfer** — apply different art styles to existing illustrations
- **Search** — Vectorize for semantic search across books and scenes

---

## 13. Summary

The Illustrator SaaS maps cleanly onto the Cloudflare platform:

| Current CLI Component | Cloudflare SaaS Equivalent |
|-----------------------|---------------------------|
| CLI input (`commander`) | React SPA on Pages |
| `fs.readFile(book.txt)` | R2 `BUCKET.get()` |
| `orchestrator.ts` pipeline | Workflows (durable execution) |
| In-memory bible/chapters | D1 (persistent) + KV (cached) |
| `fs.writeFile(book.html)` | R2 `BUCKET.put()` |
| Console output (spinners) | Real-time status via API polling |
| `p-map` parallelism | Sequential Workflow steps (MVP) → Queue fan-out (Phase 2) |
| Direct Gemini calls | Same Gemini calls, from inside Workflow steps |

The architecture preserves the core pipeline as a portable `packages/core` module that works identically in the CLI and in Cloudflare Workflows. The free tier comfortably handles MVP-level traffic (5-10 books/day, limited by Gemini, not Cloudflare). The path to scale is clear: paid tier ($5/month) + parallel processing + Workers AI.
