# Illustrator — Architecture Document

> Book-to-illustrated-HTML pipeline rebuilt on NestJS, PostgreSQL, Redis/BullMQ, and MinIO.

## 1. Overview

Illustrator is a web application that transforms uploaded `.txt` books into illustrated HTML readers using AI (Google Gemini). Users upload a book, the system analyzes it, splits it into chapters, generates character portraits and scene illustrations, and produces an interactive reader.

This document describes the new architecture after migrating away from Cloudflare Workers/D1/R2 to a self-hosted Docker-based stack.

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌───────┐   ┌─────────┐ │
│  │  NestJS   │   │  NestJS   │   │       │   │         │ │
│  │   API     │◄─►│  Worker   │◄─►│ Redis │   │ MinIO   │ │
│  │ :3000     │   │          │   │ :6379 │   │ :9000   │ │
│  └─────┬─────┘   └─────┬────┘   └───────┘   └─────────┘ │
│        │               │                                  │
│        │               │         ┌──────────┐            │
│        └───────────────┴────────►│PostgreSQL│            │
│                                  │ :5432    │            │
│                                  └──────────┘            │
└─────────────────────────────────────────────────────────┘
```

### Components

| Component      | Technology                  | Purpose                                       |
|----------------|-----------------------------|-----------------------------------------------|
| **API**        | NestJS (Express)            | REST endpoints, WebSocket gateway, serves UI  |
| **Worker**     | NestJS (standalone)         | Processes BullMQ jobs (workflow pipeline)      |
| **Database**   | PostgreSQL 16               | Persistent data (books, chapters, scenes, etc) |
| **Queue**      | Redis 7 + BullMQ            | Job queue and pub/sub for API↔Worker comms     |
| **Storage**    | MinIO (S3-compatible)       | File/image storage (books, illustrations)      |
| **Frontend**   | Vite + React 18 + MUI       | SPA served as static files by NestJS API       |

## 3. Project Structure

```
illustrator/
├── src/                          # NestJS backend (single project, two entry points)
│   ├── api/
│   │   ├── main.ts               # API bootstrap (HTTP + WebSocket)
│   │   ├── api.module.ts
│   │   ├── books/                # Books REST controller + service
│   │   ├── chapters/             # Chapters REST controller + service
│   │   └── gateway/              # Socket.IO WebSocket gateway
│   │
│   ├── worker/
│   │   ├── main.ts               # Worker bootstrap (standalone NestJS app)
│   │   ├── worker.module.ts
│   │   └── processors/           # BullMQ job processors
│   │       ├── analyze.processor.ts
│   │       ├── split.processor.ts
│   │       ├── anchor.processor.ts
│   │       ├── prepare-scenes.processor.ts
│   │       └── generate-images.processor.ts
│   │
│   ├── common/                   # Shared modules (used by both API and Worker)
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   ├── models/           # sequelize-typescript models
│   │   │   │   ├── book.model.ts
│   │   │   │   ├── bible.model.ts
│   │   │   │   ├── chapter.model.ts
│   │   │   │   ├── scene.model.ts
│   │   │   │   ├── scene-variant.model.ts
│   │   │   │   ├── anchor.model.ts
│   │   │   │   └── job.model.ts
│   │   │   └── migrations/       # Sequelize CLI migrations
│   │   │
│   │   ├── queue/
│   │   │   └── queue.module.ts   # BullMQ module registration
│   │   │
│   │   ├── storage/
│   │   │   ├── storage.module.ts
│   │   │   ├── storage.service.ts       # Abstract storage interface
│   │   │   └── minio-storage.service.ts # MinIO implementation
│   │   │
│   │   ├── ai/
│   │   │   ├── ai.module.ts
│   │   │   ├── ai-provider.interface.ts  # Abstract AI provider
│   │   │   ├── ai.service.ts            # Facade/factory
│   │   │   └── gemini/
│   │   │       ├── gemini.provider.ts    # Gemini implementation
│   │   │       └── gemini.config.ts
│   │   │
│   │   ├── config/
│   │   │   └── config.module.ts  # NestJS ConfigModule setup
│   │   │
│   │   ├── dto/                  # Shared DTOs
│   │   ├── constants/            # Queue names, job types, statuses
│   │   └── utils/                # Shared utilities (jsonRepair, etc.)
│   │
│   └── prompts/                  # LLM prompt templates (shared)
│
├── apps/
│   └── web/                      # Frontend (Vite + React + MUI)
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── api/              # API client + Socket.IO client
│       │   ├── theme/            # MUI theme configuration
│       │   └── main.tsx
│       ├── package.json
│       └── vite.config.ts
│
├── docker-compose.yml
├── Dockerfile                    # Multi-stage: builds API, Worker, and Web
├── .env.example
├── .sequelizerc                  # Sequelize CLI config paths
├── nest-cli.json
├── tsconfig.json
├── tsconfig.api.json
├── tsconfig.worker.json
├── package.json                  # Root (npm workspaces: ["apps/*"])
└── docs/
    ├── architecture.md           # This file
    └── migration-plan.md
```

## 4. Database Schema (PostgreSQL)

Migrated from D1/SQLite, adapted for PostgreSQL conventions.

### Tables

**books**
| Column       | Type         | Notes                              |
|--------------|--------------|------------------------------------|
| id           | VARCHAR(10)  | PK, nanoid                         |
| title        | VARCHAR(500) | Extracted or user-provided          |
| author       | VARCHAR(500) | Extracted or user-provided          |
| status       | ENUM         | See Book Statuses below             |
| error_msg    | TEXT         | Error details if status = 'error'   |
| storage_key  | VARCHAR(500) | MinIO object key for source .txt    |
| created_at   | TIMESTAMPTZ  | Auto                                |
| updated_at   | TIMESTAMPTZ  | Auto                                |

**bibles** (character/world bible, 1:1 with book)
| Column     | Type        | Notes                     |
|------------|-------------|---------------------------|
| id         | SERIAL      | PK                        |
| book_id    | VARCHAR(10) | FK → books.id, UNIQUE     |
| data       | JSONB       | Full bible JSON            |
| created_at | TIMESTAMPTZ |                           |

**chapters**
| Column         | Type         | Notes                       |
|----------------|--------------|-----------------------------|
| id             | SERIAL       | PK                          |
| book_id        | VARCHAR(10)  | FK → books.id               |
| number         | INTEGER      |                             |
| title          | VARCHAR(500) |                             |
| content        | TEXT         | Full chapter text            |
| status         | ENUM         | draft / editing / illustrated|
| created_at     | TIMESTAMPTZ  |                             |
| updated_at     | TIMESTAMPTZ  |                             |

**scenes**
| Column             | Type         | Notes                    |
|--------------------|--------------|--------------------------|
| id                 | SERIAL       | PK                       |
| chapter_id         | INTEGER      | FK → chapters.id         |
| paragraph_index    | INTEGER      | Position in chapter       |
| description        | TEXT         | Scene narrative            |
| visual_description | TEXT         | Visual prompt for image gen|
| entities           | JSONB        | Characters in scene        |
| setting            | TEXT         |                           |
| mood               | VARCHAR(100) |                           |

**scene_variants**
| Column       | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | SERIAL       | PK                             |
| scene_id     | INTEGER      | FK → scenes.id                 |
| storage_key  | VARCHAR(500) | MinIO object key                |
| score        | FLOAT        | AI validation score (0-1)       |
| selected     | BOOLEAN      | User's pick, default false      |
| width        | INTEGER      |                                |
| height       | INTEGER      |                                |
| created_at   | TIMESTAMPTZ  |                                |

**anchors** (character reference portraits)
| Column       | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | SERIAL       | PK                             |
| book_id      | VARCHAR(10)  | FK → books.id                  |
| name         | VARCHAR(200) | Character/entity name           |
| storage_key  | VARCHAR(500) | MinIO object key                |
| created_at   | TIMESTAMPTZ  |                                |

**jobs** (workflow tracking)
| Column       | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | SERIAL       | PK                             |
| book_id      | VARCHAR(10)  | FK → books.id                  |
| bullmq_id    | VARCHAR(200) | BullMQ job/flow ID              |
| status       | VARCHAR(50)  |                                |
| error        | TEXT         |                                |
| created_at   | TIMESTAMPTZ  |                                |
| updated_at   | TIMESTAMPTZ  |                                |

### Book Statuses
`pending` → `analyzing` → `splitting` → `anchoring` → `preparing_scenes` → `ready` → `publishing` → `done` | `error`

## 5. BullMQ Workflow Design

The book processing pipeline uses **BullMQ FlowProducer** to model the pipeline as a dependency graph (DAG). Each step is a named job type processed by a dedicated processor in the Worker.

### Flow Structure

```
                    ┌──────────────┐
                    │  finalize    │  (parent — waits for all children)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼────┐  ┌───▼────────┐
     │prepare-   │  │prepare-   │  │prepare-    │  (one per chapter batch)
     │scenes-0   │  │scenes-1   │  │scenes-N    │
     └────────┬──┘  └──────┬────┘  └───┬────────┘
              │            │           │
              └────────────┼───────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼────┐  ┌───▼────────┐
     │anchor-    │  │anchor-    │  │anchor-     │  (one per primary entity)
     │alice      │  │bob        │  │charlie     │
     └────────┬──┘  └──────┬────┘  └───┬────────┘
              │            │           │
              └────────────┼───────────┘
                           │
                    ┌──────▼───────┐
                    │    split     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   analyze    │  (leaf — runs first)
                    └──────────────┘
```

### Queue Names

| Queue              | Purpose                                    |
|--------------------|--------------------------------------------|
| `book-pipeline`    | Main pipeline flow (analyze → finalize)    |
| `image-generation` | On-demand image variant generation          |

### Job Types (all on `book-pipeline` queue)

| Job Name          | Input                    | Output / Side Effect                  |
|-------------------|--------------------------|---------------------------------------|
| `analyze`         | { bookId }               | Creates bible in DB                   |
| `split`           | { bookId }               | Creates chapters in DB                |
| `anchor`          | { bookId, entityName }   | Generates portrait, stores in MinIO   |
| `prepare-scenes`  | { bookId, chapterIds[] } | Creates scenes in DB                  |
| `finalize`        | { bookId }               | Sets book status → ready              |

### Image Generation (separate queue)

| Job Name          | Input                                  | Output                          |
|-------------------|----------------------------------------|---------------------------------|
| `generate-images` | { bookId, chapterNum, sceneIds[], variantCount } | Variants in DB + MinIO |

Progress events are emitted via `job.updateProgress()` and relayed to the client through Socket.IO.

## 6. API Endpoints

All existing endpoints are preserved with the same contracts.

### Books
| Method | Path                              | Description                    |
|--------|-----------------------------------|--------------------------------|
| POST   | /api/books                        | Upload .txt file               |
| GET    | /api/books                        | List all books                 |
| GET    | /api/books/:id                    | Get book metadata              |
| GET    | /api/books/:id/progress           | Chapter status counts          |
| GET    | /api/books/:id/reader-data        | Assembled chapters + image URLs|
| POST   | /api/books/:id/publish            | Mark book as done              |
| DELETE | /api/books/:id                    | Delete book + all assets       |

### Chapters
| Method | Path                                           | Description                     |
|--------|-------------------------------------------------|---------------------------------|
| GET    | /api/books/:id/chapters                         | List chapters (grid format)     |
| GET    | /api/books/:id/chapters/:num                    | Full chapter detail             |
| POST   | /api/books/:id/chapters/:num/generate           | Enqueue image generation job    |
| POST   | /api/books/:id/chapters/:num/save               | Save variant selections         |
| POST   | /api/books/:id/chapters/:num/edit               | Mark chapter as editable        |
| GET    | /api/books/:id/chapters/variants/:variantId/img | Stream image from MinIO         |

### WebSocket (Socket.IO)

**Namespace:** `/books`

| Event (server → client)      | Payload                                     |
|------------------------------|---------------------------------------------|
| `book:status`                | { bookId, status }                          |
| `chapter:variant-generated`  | { bookId, chapterNum, sceneId, variant }    |
| `chapter:generation-done`    | { bookId, chapterNum }                      |
| `chapter:generation-error`   | { bookId, chapterNum, error }               |

**Client joins room:** `book:{bookId}` to receive updates for a specific book.

## 7. AI Provider Abstraction

```typescript
interface AIProvider {
  analyzeBook(text: string): Promise<BookBible>;
  splitChapters(text: string): Promise<ChapterBoundary[]>;
  findKeyScenes(chapter: string, bible: BookBible): Promise<Scene[]>;
  generateImage(prompt: string, referenceImages?: Buffer[]): Promise<Buffer>;
  validateImage(image: Buffer, bible: BookBible): Promise<number>;
}
```

The `AiService` is a NestJS injectable that delegates to the configured provider (Gemini by default). New providers can be added by implementing the interface and registering them in `AiModule`.

## 8. Storage Abstraction

```typescript
interface StorageService {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}
```

MinIO implementation uses the `@aws-sdk/client-s3` package (S3-compatible). The same interface can later be swapped for AWS S3, GCS, or local filesystem.

## 9. Docker Compose Services

| Service      | Image / Build      | Ports          | Depends On        |
|--------------|--------------------|----------------|-------------------|
| `api`        | Dockerfile (api)   | 3000:3000      | postgres, redis, minio |
| `worker`     | Dockerfile (worker)| —              | postgres, redis, minio |
| `postgres`   | postgres:16-alpine | 5432:5432      | —                 |
| `redis`      | redis:7-alpine     | 6379:6379      | —                 |
| `minio`      | minio/minio        | 9000:9000, 9001:9001 | —            |

### Volumes
- `pgdata` — PostgreSQL data persistence
- `miniodata` — MinIO data persistence
- `redis-data` — Redis data persistence

## 10. Environment Variables

| Variable             | Description                      | Default                    |
|----------------------|----------------------------------|----------------------------|
| `NODE_ENV`           | Environment                      | development                |
| `PORT`               | API server port                  | 3000                       |
| `DATABASE_URL`       | PostgreSQL connection string     | postgres://illustrator:illustrator@postgres:5432/illustrator |
| `REDIS_HOST`         | Redis hostname                   | redis                      |
| `REDIS_PORT`         | Redis port                       | 6379                       |
| `MINIO_ENDPOINT`     | MinIO endpoint                   | minio                      |
| `MINIO_PORT`         | MinIO API port                   | 9000                       |
| `MINIO_ACCESS_KEY`   | MinIO access key                 | minioadmin                 |
| `MINIO_SECRET_KEY`   | MinIO secret key                 | minioadmin                 |
| `MINIO_BUCKET`       | Default bucket name              | illustrator                |
| `GEMINI_API_KEY`     | Google Gemini API key            | —                          |
| `AI_PROVIDER`        | AI provider to use               | gemini                     |

## 11. Development Workflow

```bash
# Start all services
docker-compose up -d

# Run migrations
npm run db:migrate

# Watch mode (API)
npm run start:api:dev

# Watch mode (Worker)
npm run start:worker:dev

# Frontend dev server (with proxy to API)
cd apps/web && npm run dev

# Build frontend and copy to API static folder
npm run build:web
```

In development, the Vite dev server runs separately with a proxy to the NestJS API on port 3000. For production/Docker, the built frontend is served by NestJS via `@nestjs/serve-static`.
