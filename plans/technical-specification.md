# Technical Specification: AI-Illustrated Book SaaS

> **Status:** Locked (v2 — revised 2026-03-28)  
> **Date:** 2026-03-28  
> **Origin:** Challenged and revised from [`plan.stage0.md`](plan.stage0.md)  
> **Architecture diagram:** [`illustrated_book_saas_architecture.svg`](illustrated_book_saas_architecture.svg) (to be updated)  
> **Revision history:** v1 → v2 changes documented in [Appendix A](#appendix-a-v1--v2-changes)

---

## 1. Problem Definition

Build a SaaS platform that takes uploaded text files (books), splits them into chapters using AI, generates a visual "style bible" for character/location consistency, then produces AI-generated illustrations for each chapter's key scene — delivering an illustrated book reading experience.

The original [`plan.stage0.md`](plan.stage0.md) described the pipeline concept but left the technology stack critically underspecified: no type safety strategy, no ORM, no auth approach, no developer tooling, no internal architecture, no observability, contradictory framework mentions, and unrealistic free-tier assumptions. This specification resolves all identified gaps.

---

## 2. Technology Stack — Complete

### 2.1 Language & Type Safety

| Decision | Details |
|---|---|
| **Language** | TypeScript (strict mode) everywhere — frontend, API, workers, shared packages |
| **tsconfig** | `strict: true`, `noUncheckedIndexedAccess: true`, no `any` allowed |
| **Runtime validation** | Zod for all external boundaries: AI API responses, user inputs, file parsing, job payloads, environment variables |
| **Type pipeline** | `Drizzle schema → drizzle-zod → Zod schemas → tRPC procedures → @trpc/react-query` |
| **Env validation** | `@t3-oss/env-core` — Zod-validated environment variables, crashes at startup if misconfigured |

### 2.2 Backend

| Component | Technology | Rationale |
|---|---|---|
| **HTTP server** | **Express** | Most battle-tested Node.js framework, dominant ecosystem, first-class adapters for tRPC and Clerk, proven file upload handling via multer |
| **API layer** | **tRPC v10** (stable) | End-to-end type-safe RPC, native Zod integration, automatic client types. v10 over v11 for stability and documentation availability |
| **Hybrid routing** | Express handles: `POST /api/upload` (multipart via multer), `GET /api/progress/:bookId` (SSE). tRPC handles: `/api/trpc/*` (all typed procedures) |
| **File uploads** | `multer` on dedicated Express route | Most battle-tested upload middleware in Node.js |
| **Real-time progress** | Server-Sent Events (SSE) via Express route, using BullMQ `QueueEvents` to listen for job progress from Redis |
| **Logging** | `pino` via `pino-http` middleware | Structured JSON logging to stdout |
| **Async errors** | `express-async-errors` | One-line import, enables async route handlers without try/catch wrappers |

### 2.3 Database

| Component | Technology | Rationale |
|---|---|---|
| **Database** | **PostgreSQL 16** | Standard relational DB for books, chapters, users, job metadata |
| **Hosting (production)** | **Supabase** — as hosted Postgres only | Direct connection string, no Supabase JS client, no vendor lock-in on query layer |
| **Hosting (development)** | **Docker container** (postgres:16-alpine) | Local dev via docker-compose |
| **ORM** | **Drizzle ORM** | SQL-like TypeScript syntax, native Zod integration via `drizzle-zod`, near raw SQL performance |
| **Migrations** | **drizzle-kit** | SQL-based migrations, push/pull/generate commands |
| **Schema → Zod** | **drizzle-zod** | Auto-generates insert/select Zod schemas from Drizzle table definitions |

### 2.4 Queue & Workers

| Component | Technology | Rationale |
|---|---|---|
| **Job queue** | **BullMQ** | Battle-tested, built-in retry with exponential backoff, `QueueEvents` for cross-process event listening |
| **Redis** | **Redis 7** (Docker container in dev, managed service in prod) | BullMQ's backing store |
| **Pipeline orchestration** | **Multi-stage state machine** (NOT `FlowProducer`) | Dynamic fan-out required — chapter count unknown until splitter runs. Each stage completes → dispatches next stage. See [Section 4.2](#42-book-processing-pipeline-state-machine) |
| **Concurrency** | 2-3 workers max | Respects AI API rate limits |
| **Failure strategy** | Any chapter job failure after retries → entire book marked `failed` | Simple, predictable UX — user retries the whole book |

### 2.5 Frontend

| Component | Technology | Rationale |
|---|---|---|
| **Meta-framework** | **Vite** (React SPA, no SSR) | Simple, fast builds, no SSR complexity needed (book reader is behind auth) |
| **UI framework** | **React 19** | Standard |
| **Component library** | **Mantine UI** | Batteries-included: Dropzone, Progress, Image, NavLink, Notifications. Own styling system |
| **Server state** | **@trpc/react-query** (TanStack Query) | Type-safe data fetching, automatic cache management, no Redux/Zustand needed |
| **Routing** | **TanStack Router** | Built-in type-safe route params and search params, consistent with strict TypeScript strategy |
| **Forms** | **@mantine/form** | Integrated with Mantine components |

### 2.6 Authentication

| Component | Technology | Rationale |
|---|---|---|
| **Auth provider** | **Clerk** (hosted SaaS) | No self-hosted auth management, free up to 10k MAU |
| **Frontend integration** | **Headless Clerk** with custom Mantine form components | Consistent UI with the rest of the app, full design control |
| **Backend integration** | **@clerk/express** | First-class Express middleware for JWT verification |
| **tRPC context** | Custom context creator extracts Clerk `userId` from verified JWT → injects into tRPC context |
| **Dev bypass** | In development (`NODE_ENV=development`), auth middleware injects a mock user without calling Clerk's JWKS endpoint. Enables fully offline docker-compose development |

### 2.7 File & Image Storage

| Component | Technology | Rationale |
|---|---|---|
| **Object storage** | **Cloudflare R2** | S3-compatible API, free egress, 10GB free tier |
| **SDK** | `@aws-sdk/client-s3` | Standard S3 client works with R2 |
| **Stored files** | Original uploaded .txt files, generated illustration images |
| **Dev alternative** | **MinIO** (Docker container) | S3-compatible local development |

### 2.8 AI Services (unchanged from original plan)

| Service | Provider | Purpose |
|---|---|---|
| **Text processing** | Groq (Llama 3.3 70B, free tier) | Chapter splitting, key scene extraction, style bible generation |
| **Text fallback** | HuggingFace Inference API (Mistral/Llama) | If Groq is unavailable |
| **Image generation** | Pollinations.ai (Flux models, free, no API key) | Chapter illustrations with seed control for consistency |
| **Image fallback** | HuggingFace Inference API (Stable Diffusion XL) | Queue-based, slower |
| **Text emergency fallback** | Claude Sonnet (paid) | Only if free models produce insufficient quality |

### 2.9 Developer Tooling

| Tool | Purpose | Configuration |
|---|---|---|
| **Biome** | Linting + formatting (all-in-one) | Single `biome.json` at monorepo root, replaces both ESLint and Prettier |
| **Vitest** | Unit + integration testing | Shares Vite config, Jest-compatible API |
| **GitHub Actions** | CI pipeline | Type-check, lint, test, build on every PR. No git hooks / no pre-commit |
| **TypeScript** | Type checking | `tsc --noEmit` in CI |
| **docker-compose** | Local development environment | Postgres + Redis + MinIO + API + Worker |
| **@t3-oss/env-core** | Environment variable validation | Zod schemas for all env vars, crashes on startup if invalid |

---

## 3. Monorepo Structure

```
illustrator/
├── apps/
│   ├── web/                    # Vite + React SPA
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── auth/       # Headless Clerk + Mantine forms
│   │   │   │   ├── library/    # Book grid, status indicators
│   │   │   │   ├── upload/     # File upload with Mantine Dropzone
│   │   │   │   └── reader/     # Chapter navigation, illustrated reader
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── routes/         # TanStack Router route definitions
│   │   │   ├── trpc.ts         # tRPC client setup
│   │   │   ├── env.ts          # @t3-oss/env-core client env validation
│   │   │   └── main.tsx        # App entry
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── api/                    # Express + tRPC server
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── books/
│   │   │   │   │   ├── router.ts    # tRPC procedures (thin)
│   │   │   │   │   ├── service.ts   # Business logic
│   │   │   │   │   ├── queries.ts   # Drizzle queries
│   │   │   │   │   └── jobs.ts      # BullMQ job dispatch
│   │   │   │   └── chapters/
│   │   │   │       ├── router.ts
│   │   │   │       ├── service.ts
│   │   │   │       └── queries.ts
│   │   │   ├── routes/
│   │   │   │   ├── upload.ts        # Express multer upload route
│   │   │   │   └── progress.ts      # SSE progress route (QueueEvents → SSE)
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts          # Clerk JWT verification (+ dev bypass)
│   │   │   ├── trpc.ts              # tRPC init, context, middleware
│   │   │   ├── env.ts               # @t3-oss/env-core server env validation
│   │   │   └── server.ts            # Express setup, middleware registration
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── worker/                 # BullMQ workers
│       ├── src/
│       │   ├── handlers/
│       │   │   ├── splitChapters.ts
│       │   │   ├── generateStyleBible.ts
│       │   │   ├── processChapter.ts     # Scene extraction + image gen
│       │   │   └── assembleBook.ts
│       │   ├── services/
│       │   │   ├── groq.ts              # Groq API wrapper
│       │   │   ├── pollinations.ts      # Pollinations API wrapper
│       │   │   └── storage.ts           # R2/MinIO upload
│       │   ├── orchestrator.ts          # State machine: stage completion → next stage dispatch
│       │   ├── env.ts                   # @t3-oss/env-core worker env validation
│       │   └── index.ts                 # Worker entry, queue registration
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared/                 # Shared types, schemas, contracts
│       ├── src/
│       │   ├── db/
│       │   │   ├── schema.ts           # Drizzle table definitions
│       │   │   └── index.ts            # drizzle-zod generated schemas
│       │   ├── jobs/
│       │   │   └── contracts.ts        # BullMQ job name → payload Zod schemas
│       │   ├── ai/
│       │   │   └── schemas.ts          # Zod schemas for AI API responses
│       │   └── index.ts
│       └── package.json
│       # NOTE: If this package grows too large and invalidates Turborepo
│       # caches too often, split into: packages/db, packages/contracts,
│       # packages/ai-schemas
│
├── docker-compose.yml          # Postgres + Redis + MinIO + API + Worker
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # Workspace definition
├── biome.json                  # Linting + formatting config (root)
├── tsconfig.base.json          # Shared TypeScript config
├── AGENTS.md                   # AI coding agent configuration
└── .github/
    └── workflows/
        └── ci.yml              # GitHub Actions: typecheck, lint, test, build
```

### Package Management

| Tool | Purpose |
|---|---|
| **pnpm** | Package manager — strict dependency resolution, workspace support, disk-efficient |
| **pnpm-workspace.yaml** | Defines `apps/*` and `packages/*` as workspace members |
| **Turborepo** | Build orchestration — dependency-aware task running, local caching |
| **turbo.json** | Defines pipeline: `build` depends on `^build`, `test` depends on `build`, `lint` has no deps |

---

## 4. Data Flow

### 4.1 Type Pipeline (single source of truth)

```
Drizzle schema (packages/shared/src/db/schema.ts)
    ↓ drizzle-zod
Zod schemas (packages/shared/src/db/index.ts)
    ↓ imported by
tRPC procedures (apps/api/src/features/*/router.ts) — input/output validation
    ↓ type inference
@trpc/react-query (apps/web/src/trpc.ts) — fully typed client
    ↓ consumed by
React components (apps/web/src/features/*) — typed data, no manual types
```

### 4.2 Book Processing Pipeline (State Machine)

The pipeline uses a **multi-stage state machine** pattern, NOT a single BullMQ `FlowProducer`. This is necessary because the chapter count is unknown until the splitter completes — dynamic fan-out cannot be expressed as a static flow graph.

**Book status transitions:**
```
uploading → splitting → generating_bible → illustrating → assembling → published
                                                                    ↘ failed
                                              (any stage can → failed)
```

**Stage-by-stage orchestration:**

```
1. API receives upload → stores file in R2 → creates book (status: 'uploading')
   → dispatches Job: split-chapters
   → updates book status: 'splitting'

2. split-chapters handler completes
   → creates chapter DB rows with boundaries
   → dispatches Job: generate-style-bible
   → updates book status: 'generating_bible'

3. generate-style-bible handler completes
   → stores style bible on book record
   → dispatches N × Job: process-chapter (one per chapter)
   → stores expected_chapters = N on book record
   → updates book status: 'illustrating'

4. Each process-chapter handler completes
   → stores image in R2, updates chapter record
   → increments completed_chapters counter (atomic DB update)
   → IF completed_chapters === expected_chapters:
       → dispatches Job: assemble-book
       → updates book status: 'assembling'
   → IF any chapter fails after retries:
       → updates book status: 'failed'

5. assemble-book handler completes
   → combines chapters + images into final structure
   → updates book status: 'published'
```

**Key implementation detail:** Step 4's "am I the last chapter?" check uses an **atomic Postgres UPDATE...RETURNING** to avoid race conditions:
```sql
UPDATE books
SET completed_chapters = completed_chapters + 1
WHERE id = $bookId
RETURNING completed_chapters, expected_chapters
```

### 4.3 SSE Progress Flow

```
Frontend opens EventSource → GET /api/progress/:bookId
    ↓
Express SSE route creates BullMQ QueueEvents listener (connects to Redis directly)
    ↓
Worker updates job progress → Redis pub/sub → QueueEvents receives event → SSE pushes to client
    ↓
React component updates progress bar (Mantine <Progress />)
    ↓
Heartbeat every 15s to keep connection alive
Reconnection via Last-Event-ID header if connection drops
```

**Note:** `QueueEvents` connects to Redis from the API process — it does NOT require the worker and API to be in the same process. This is how cross-process event listening works in BullMQ.

---

## 5. Docker Compose (Local Development)

```yaml
# Services:
# - postgres:16-alpine     (port 5432)
# - redis:7-alpine         (port 6379)
# - minio                  (port 9000, S3-compatible)
# - api                    (port 3000, Express + tRPC)
# - worker                 (BullMQ consumer, no exposed port)
```

Frontend (`apps/web`) runs outside docker via `pnpm dev` for HMR performance.

**Dev auth bypass:** When `NODE_ENV=development`, the auth middleware skips Clerk JWT verification and injects a mock user (`userId: 'dev-user-001'`). This enables fully offline development without Internet access to Clerk's JWKS endpoint.

---

## 6. Known Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `drizzle-zod` only generates insert/select schemas | 🟡 Medium | Extend with `.pick()/.omit()/.extend()` for API-facing shapes; custom Zod schemas for AI responses |
| Mantine + Clerk styling conflicts | 🟡 Medium | Headless Clerk with custom Mantine forms (decided) |
| Multi-stage pipeline completion tracking has race condition potential | 🟡 Medium | Atomic `UPDATE...RETURNING` in Postgres for chapter completion counting |
| SSE connection timeouts from reverse proxies | 🟡 Medium | 15s heartbeat, `Last-Event-ID` reconnection, tRPC polling fallback |
| AI API rate limits (Groq ~30 req/min, Pollinations variable) | 🟡 Medium | BullMQ concurrency=2-3, exponential backoff retries |
| Free AI image consistency is "stylistically similar" not pixel-perfect | 🟢 Accepted | Style bible + prompt engineering + seed pinning; honest trade-off |
| `packages/shared` could become a dependency bottleneck | 🟢 Low (future) | Split into `packages/db`, `packages/contracts`, `packages/ai-schemas` when needed |

**Eliminated risks (from v1):**
- ~~Fastify + tRPC adapter less tested~~ → Switched to Express (most-used tRPC adapter)
- ~~`@clerk/fastify` poorly documented~~ → `@clerk/express` is first-class
- ~~FlowProducer can't handle dynamic fan-out~~ → Redesigned as multi-stage state machine

---

## 7. What's NOT In Scope (Deferred)

- **Production deployment platform** — docker-compose for now, platform choice (Railway/Fly.io/Render) deferred
- **Error tracking** (Sentry) — add later when production issues arise
- **Git hooks** (Husky/lint-staged) — CI is the quality gate
- **EPUB export** — future feature, `epub-gen` package noted
- **Social login** — Clerk supports it, but email/password first
- **Paid AI models** (LoRA/IP-Adapter for consistency) — future feature requiring GPU compute
- **Rate limiting / abuse prevention** — needed before public launch
- **Billing / subscription** (Stripe) — needed before monetization
- **tRPC v11 migration** — start with v10 stable, upgrade when v11 reaches GA

---

## 8. Next Steps

1. Switch to **Architect mode** to design the database schema (Drizzle tables for books, chapters, style bibles, processing status with state machine columns)
2. Scaffold the monorepo structure with Turborepo + pnpm
3. Set up docker-compose with Postgres + Redis + MinIO
4. Implement the Express + tRPC server skeleton with Clerk auth middleware + dev bypass
5. Build the BullMQ state machine pipeline with a simple test flow
6. Implement the Vite + React + Mantine + TanStack Router frontend shell

---

## Appendix A: v1 → v2 Changes

| Area | v1 Decision | v2 Decision | Reason |
|---|---|---|---|
| **HTTP server** | Fastify | **Express** | 3/7 risks traced to Fastify; Express has best-in-class tRPC + Clerk adapters; performance difference invisible (AI APIs dominate latency) |
| **tRPC version** | v11 | **v10** (stable) | v11 not yet GA; v10 has better documentation and community support |
| **Pipeline orchestration** | BullMQ `FlowProducer` | **Multi-stage state machine** | `FlowProducer` requires static children declaration; chapter count unknown until splitter runs; dynamic fan-out needs stage-by-stage dispatch |
| **Frontend routing** | "React Router v7 (or TanStack Router)" | **TanStack Router** | Built-in type-safe params/search consistent with strict TypeScript strategy; eliminates indecision |
| **Env management** | Not specified | **@t3-oss/env-core** | Zod-validated env vars at startup; fits Zod-everywhere strategy; catches misconfig before runtime |
| **Dev auth** | Not specified | **Dev bypass mode** | Clerk requires Internet for JWKS; mock user injection in development enables offline docker-compose dev |
| **packages/shared** | Single package, no note | Single package + **split note** | Future refactoring guidance if Turborepo cache invalidation becomes an issue |
