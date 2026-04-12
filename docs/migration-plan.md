# Illustrator — Migration Plan

> Migrating from Cloudflare Workers/D1/R2 to NestJS/PostgreSQL/Redis/MinIO.

## Phase 1: Project Scaffold & Infrastructure

### 1.1 Clean up Cloudflare artifacts
- Remove `wrangler.toml`, Cloudflare-specific config
- Remove `@cloudflare/*` dependencies
- Remove D1 migration files (replaced by Sequelize migrations)
- Remove Cloudflare Workflow code
- Keep `.git` history intact

### 1.2 Set up NestJS project
- Initialize NestJS with `nest-cli.json` configured for two entry points
- Create `src/api/main.ts` — HTTP server + WebSocket + static file serving
- Create `src/worker/main.ts` — standalone NestJS app for BullMQ processing
- Configure TypeScript with separate tsconfig per entry point
- Set up `apps/web/` for the React frontend (npm workspace)

### 1.3 Docker & docker-compose
- Create multi-stage `Dockerfile` (build → api runtime, worker runtime)
- Create `docker-compose.yml` with all 5 services (api, worker, postgres, redis, minio)
- Create `.env.example` with all required variables
- Ensure `docker-compose up` starts everything from scratch

## Phase 2: Database & Models

### 2.1 Sequelize setup
- Install `sequelize`, `sequelize-typescript`, `pg`, `pg-hstore`
- Install `sequelize-cli` as dev dependency
- Create `.sequelizerc` pointing to migration/model/seed directories
- Create `DatabaseModule` as shared NestJS module

### 2.2 Models (sequelize-typescript)
- `Book` — with ENUM status type
- `Bible` — JSONB data field, 1:1 with Book
- `Chapter` — with ENUM status type
- `Scene` — JSONB entities field
- `SceneVariant` — linked to Scene
- `Anchor` — character reference portraits
- `Job` — workflow job tracking

### 2.3 Migrations
- Generate initial migration from models
- Test migration runs cleanly on fresh PostgreSQL

## Phase 3: Shared Modules

### 3.1 Queue module (BullMQ)
- Install `@nestjs/bullmq`, `bullmq`, `ioredis`
- Register queues: `book-pipeline`, `image-generation`
- Create `QueueModule` importable by both API and Worker

### 3.2 Storage module (MinIO)
- Install `@aws-sdk/client-s3`
- Implement `StorageService` interface with `MinioStorageService`
- Auto-create bucket on startup if missing
- Create `StorageModule` as global module

### 3.3 AI provider module
- Define `AIProvider` interface with all methods
- Port `gemini.ts` → `GeminiProvider` (NestJS injectable)
- Keep all prompt templates in `src/prompts/`
- Port utility functions: `jsonRepair`, `llmRetry`, `truncationGuard`
- Create `AiModule` with provider factory

### 3.4 Config module
- Use `@nestjs/config` with `.env` file
- Define config validation schema (class-validator or Joi)

## Phase 4: API Application

### 4.1 Books module
- Port all book endpoints from Hono to NestJS controllers
- `BooksController` + `BooksService`
- File upload via `@nestjs/platform-express` multer
- On upload: store in MinIO, create DB record, enqueue pipeline flow

### 4.2 Chapters module
- Port all chapter endpoints
- `ChaptersController` + `ChaptersService`
- Image generation endpoint now enqueues a job instead of doing SSE
- Image streaming endpoint reads from MinIO

### 4.3 WebSocket gateway (Socket.IO)
- Create `BooksGateway` using `@nestjs/websockets`
- Namespace: `/books`
- Client joins `book:{bookId}` room
- Worker pushes updates to Redis pub/sub → API relays to clients
- Events: `book:status`, `chapter:variant-generated`, `chapter:generation-done`

### 4.4 Static file serving
- Install `@nestjs/serve-static`
- Serve `apps/web/dist/` at root path
- API routes prefixed with `/api/` take priority

## Phase 5: Worker Application

### 5.1 Pipeline processors
Port each Cloudflare Workflow step to a BullMQ processor:

| Old (Workflow step)         | New (BullMQ processor)         |
|-----------------------------|--------------------------------|
| `read-book` + `analyze`    | `AnalyzeProcessor`             |
| `split-chapters`           | `SplitProcessor`               |
| `anchor-{name}`            | `AnchorProcessor`              |
| `prepare-scenes-batch-{n}` | `PrepareScenesProcessor`       |
| (new)                      | `FinalizeProcessor`            |

### 5.2 Image generation processor
- `GenerateImagesProcessor` on `image-generation` queue
- Uses `job.updateProgress()` to emit variant-level progress
- API subscribes to BullMQ job events and relays via Socket.IO

### 5.3 Flow composition
- Create `PipelineService` that builds a FlowProducer tree
- Called by API's `BooksService` after upload
- Flow dependencies ensure correct execution order

## Phase 6: Frontend

### 6.1 Replace UI framework
- Remove Tailwind CSS v4, shadcn/ui, Radix primitives
- Install MUI (`@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`)
- Create MUI theme configuration
- Rewrite all components using MUI components

### 6.2 Adapt API client
- Update base URL / proxy configuration
- Replace SSE-based image generation with Socket.IO client
- Add Socket.IO connection management (connect/disconnect lifecycle)

### 6.3 Rewrite pages
- **Home** — Book upload form (MUI)
- **BookList** — Data grid or card layout (MUI)
- **BookDetail** — Chapter grid, progress indicators, publish action
- **ChapterPage** — Scene cards, variant gallery, generation with live progress via WebSocket
- **BookReader** — Illustrated reader view

## Phase 7: Integration & Testing

### 7.1 End-to-end validation
- `docker-compose up` starts all services
- Upload a test book
- Verify pipeline runs through all steps
- Verify image generation with WebSocket progress
- Verify reader view

### 7.2 Cleanup
- Remove old Cloudflare-specific files
- Update README.md
- Verify `.gitignore` covers new artifacts (node_modules, dist, .env, pgdata, etc.)

## Execution Order

The phases above are designed to be executed in order, as each depends on the previous:

1. **Scaffold** → establishes the project skeleton
2. **Database** → models needed by all other code
3. **Shared modules** → used by both API and Worker
4. **API** → the HTTP interface
5. **Worker** → the background processing
6. **Frontend** → the user-facing UI
7. **Integration** → verify everything works together

## Risk Mitigation

| Risk                                    | Mitigation                                        |
|-----------------------------------------|---------------------------------------------------|
| Data loss during migration              | Fresh DB — no data migration needed (dev project) |
| Gemini API differences outside Workers  | Gemini SDK works in Node.js natively              |
| BullMQ Flow complexity                  | Start with simple sequential, add DAG later       |
| MinIO S3 compatibility gaps             | Use official AWS SDK, well-tested compatibility   |
| Socket.IO scaling                       | Redis adapter built into Socket.IO for multi-node |
