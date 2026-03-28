# Illustrator - AI-Illustrated Book SaaS

Transform your stories into beautifully illustrated books using AI.

## Architecture

Monorepo structure built with pnpm + Turborepo:

- **`apps/web`** — React SPA (Vite, Mantine UI, TanStack Router, Clerk)
- **`apps/api`** — Express + tRPC server (Drizzle ORM, BullMQ dispatch, Clerk auth)
- **`apps/worker`** — BullMQ workers (Groq AI, Pollinations image generation)
- **`packages/shared`** — Drizzle schemas, Zod types, job contracts, AI prompts

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Package manager | pnpm 9+ |
| Monorepo | Turborepo + pnpm workspaces |
| Backend | Express 4 + tRPC v10 |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Frontend | React 19 + Vite + Mantine UI |
| Routing | TanStack Router |
| Auth | Clerk (headless) |
| Storage | Cloudflare R2 (MinIO for dev) |
| AI Text | Groq (LLaMA 3.3) |
| AI Images | Pollinations (Flux) |
| Linting | Biome |
| Testing | Vitest |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for local dev)

## Getting Started

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd Illustrator
pnpm install
```

### 2. Set up environment variables

Copy example env files and fill in your API keys:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
```

Required API keys:
- **Clerk**: Get from [clerk.com](https://clerk.com) (free tier available)
- **Groq**: Get from [console.groq.com](https://console.groq.com) (free tier available)

### 3. Start development environment

```bash
# Start PostgreSQL, Redis, and MinIO via Docker
docker-compose up -d postgres redis minio

# Run database migrations
pnpm --filter @illustrator/shared db:push

# Start all apps in development mode
pnpm dev
```

This starts:
- **API server** → http://localhost:3000
- **Worker** → Background process (no UI)
- **Web app** → http://localhost:5173
- **MinIO console** → http://localhost:9001 (minioadmin / minioadmin)

### 4. Create MinIO bucket

Open http://localhost:9001, login with `minioadmin` / `minioadmin`, and create a bucket named `illustrator` with public read access.

## Development Workflow

### Running commands

```bash
# Run on all packages
pnpm dev              # Start all apps in watch mode
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm lint             # Lint all packages
pnpm check            # Format and lint with Biome

# Run on specific package
pnpm --filter @illustrator/api dev
pnpm --filter @illustrator/worker build
pnpm --filter @illustrator/web test
```

### Database migrations

```bash
# Generate migration from schema changes
pnpm --filter @illustrator/shared db:generate

# Apply migrations to database
pnpm --filter @illustrator/shared db:push

# Open Drizzle Studio (database GUI)
pnpm --filter @illustrator/shared db:studio
```

### Code quality

This project uses **Biome** for formatting and linting (NOT ESLint/Prettier):

```bash
pnpm check            # Format and lint all files
pnpm format           # Format only
pnpm lint             # Lint only
```

## Project Structure

```
├── apps/
│   ├── api/              # Express + tRPC server
│   │   ├── src/
│   │   │   ├── features/     # Feature modules (books, chapters)
│   │   │   │   └── books/
│   │   │   │       ├── router.ts    # tRPC procedures (thin)
│   │   │   │       ├── service.ts   # Business logic
│   │   │   │       ├── queries.ts   # Data access
│   │   │   │       └── jobs.ts      # Job dispatch
│   │   │   ├── middleware/   # Auth, logging
│   │   │   ├── routes/       # Express raw routes (upload, SSE)
│   │   │   └── server.ts     # Entry point
│   │   └── package.json
│   ├── worker/           # BullMQ workers
│   │   ├── src/
│   │   │   ├── handlers/     # Job handlers (one per stage)
│   │   │   ├── services/     # AI service wrappers
│   │   │   ├── orchestrator.ts  # State machine coordinator
│   │   │   └── index.ts      # Worker entry point
│   │   └── package.json
│   └── web/              # React SPA
│       ├── src/
│       │   ├── routes/       # TanStack Router pages
│       │   ├── features/     # Feature components
│       │   ├── components/   # Shared components
│       │   └── main.tsx      # Entry point
│       └── package.json
├── packages/
│   └── shared/           # Shared types and contracts
│       ├── src/
│       │   ├── db/           # Drizzle schemas + Zod types
│       │   ├── jobs/         # BullMQ job contracts
│       │   └── ai/           # AI prompts + response schemas
│       └── package.json
├── docker-compose.yml    # Local dev environment
├── turbo.json            # Turborepo config
├── biome.json            # Biome config
└── AGENTS.md             # AI coding agent rules
```

## How It Works

### Processing Pipeline

```
1. Upload (POST /api/upload)
   ↓
2. splitChapters (Groq AI)
   ↓
3. generateStyleBible (Groq AI)
   ↓
4. processChapter × N (Groq + Pollinations, fan-out)
   ↓
5. assembleBook (PDF generation — deferred)
   ↓
6. Published
```

Each stage updates book status and dispatches the next stage's jobs. Progress is streamed to frontend via SSE.

### Type Safety

The entire stack is **100% type-safe** via this pipeline:

```
Drizzle schema → drizzle-zod → Zod schemas → tRPC → @trpc/react-query → React
```

No manual type definitions needed — database is the source of truth.

## Deployment

See [`plans/docker-and-env.md`](plans/docker-and-env.md) for production deployment guide.

## Documentation

- **Technical Specification**: [`plans/technical-specification.md`](plans/technical-specification.md)
- **Database Schema**: [`plans/database-schema.md`](plans/database-schema.md)
- **Job Contracts**: [`plans/job-contracts.md`](plans/job-contracts.md)
- **AI Service Schemas**: [`plans/ai-service-schemas.md`](plans/ai-service-schemas.md)
- **API Routes**: [`plans/api-routes.md`](plans/api-routes.md)
- **Frontend Routes**: [`plans/frontend-routes.md`](plans/frontend-routes.md)
- **Docker & Environment**: [`plans/docker-and-env.md`](plans/docker-and-env.md)
- **AI Coding Agent Rules**: [`AGENTS.md`](AGENTS.md)

## License

MIT
