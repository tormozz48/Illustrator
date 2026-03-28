# AGENTS.md — AI Coding Agent Configuration

> **Source of truth:** [`plans/technical-specification.md`](plans/technical-specification.md)  
> **Last updated:** 2026-03-28

---

## Project Overview

AI-Illustrated Book SaaS — users upload text files (books), the system splits them into chapters via AI, generates a visual style bible for character consistency, then produces AI-generated illustrations for each chapter. Monorepo with React frontend, Express API, and BullMQ background workers.

---

## Tech Stack (Use ONLY These)

| Layer | Technology | Version |
|---|---|---|
| **Language** | TypeScript (strict) | 5.x |
| **Package manager** | pnpm | latest |
| **Monorepo** | Turborepo + pnpm workspaces | latest |
| **Backend framework** | Express | 4.x |
| **API layer** | tRPC | **v10** (NOT v11) |
| **ORM** | Drizzle ORM | latest |
| **Schema validation** | Zod + drizzle-zod | latest |
| **Job queue** | BullMQ | latest |
| **Database** | PostgreSQL | 16 |
| **Cache/Queue store** | Redis | 7 |
| **Frontend** | React | 19 |
| **Build tool** | Vite | latest |
| **UI components** | Mantine UI | latest |
| **Routing** | TanStack Router | latest |
| **Server state** | @trpc/react-query (TanStack Query) | latest |
| **Forms** | @mantine/form | latest |
| **Auth** | Clerk (headless) | latest |
| **Object storage** | Cloudflare R2 via @aws-sdk/client-s3 | latest |
| **Logging** | pino + pino-http | latest |
| **Linter + Formatter** | Biome | latest |
| **Testing** | Vitest | latest |
| **Env validation** | @t3-oss/env-core | latest |
| **CI** | GitHub Actions | — |

---

## Monorepo Structure

```
apps/web/         → Vite + React SPA (Mantine, TanStack Router, Headless Clerk)
apps/api/         → Express + tRPC server (Drizzle, BullMQ dispatch, Clerk auth)
apps/worker/      → BullMQ workers (AI service calls, image generation)
packages/shared/  → Drizzle schemas, Zod types, BullMQ job contracts, AI response schemas
```

---

## Coding Standards (All Packages)

### TypeScript Strictness
- `strict: true` and `noUncheckedIndexedAccess: true` in all tsconfig files
- **NEVER use `any`** — use `unknown` and narrow with Zod parsing instead
- **NEVER use `as` type assertions** except in test files — prefer Zod `.parse()` for runtime narrowing
- **NEVER use `// @ts-ignore` or `// @ts-expect-error`** — fix the type issue properly
- All function parameters and return types should be inferable or explicitly typed

### Zod Everywhere
- Every external boundary MUST have a Zod schema: API inputs, AI responses, file parsing, job payloads, env vars
- Parse, don't validate: use `schema.parse(data)` not `schema.safeParse(data)` unless you need error handling
- Extend Drizzle schemas with `.pick()`, `.omit()`, `.extend()` — don't duplicate field definitions

### Formatting & Linting
- **Use Biome** for formatting and linting — NOT ESLint, NOT Prettier
- Run `biome check` for both lint and format
- Configuration lives in root `biome.json`
- No git hooks — CI is the quality gate

### Imports
- Use path aliases (`@shared/*`, `@api/*`, `@web/*`, `@worker/*`) — never deep relative imports like `../../../`
- Import from package entry points: `import { BookSchema } from '@shared'` not `from '@shared/src/db/schema'`
- Group imports: external libs → shared packages → local modules (Biome handles sorting)

### Naming Conventions
- **Files:** `camelCase.ts` (e.g., `splitChapters.ts`, `styleBible.ts`, `bookService.ts`)
- **Types/Interfaces:** `PascalCase` (e.g., `BookRecord`, `ChapterPayload`)
- **Variables/Functions:** `camelCase`
- **Zod schemas:** `PascalCase` with `Schema` suffix (e.g., `BookInsertSchema`, `ChapterSelectSchema`, `StyleBibleResponseSchema`)
- **tRPC routers:** `camelCase` (e.g., `booksRouter`, `chaptersRouter`)
- **BullMQ job names:** `camelCase` strings (e.g., `'splitChapters'`, `'processChapter'`, `'generateStyleBible'`)
- **Environment variables:** `SCREAMING_SNAKE_CASE`
- **Directories:** `camelCase` for feature directories, lowercase for structural directories (`features/`, `routes/`, `middleware/`)

---

## Architecture Patterns

### Type Pipeline (Critical — Follow This Flow)

```
1. Define table    → packages/shared/src/db/schema.ts     (Drizzle pgTable)
2. Generate Zod    → packages/shared/src/db/index.ts      (drizzle-zod createInsertSchema/createSelectSchema)
3. Use in tRPC     → apps/api/src/features/*/router.ts    (input/output validation)
4. Auto-typed      → apps/web/src/trpc.ts                 (inferred by @trpc/react-query)
5. Consumed by     → apps/web/src/features/*/             (fully typed, no manual type definitions)
```

**Rule:** Database is the source of truth for all data types. NEVER define a type manually that could be derived from a Drizzle schema.

### Flat Feature Modules

Every feature is a co-located directory:

```
features/books/
  ├── router.ts     # tRPC procedures — THIN: validate input, call service, return result
  ├── service.ts    # Business logic — orchestration, validation rules, job dispatch decisions
  ├── queries.ts    # Drizzle queries — data access ONLY, no business logic
  └── jobs.ts       # BullMQ job dispatch — creates typed jobs from packages/shared contracts
```

**Rules:**
- `router.ts` must be thin — no business logic, no direct DB queries, no BullMQ calls
- `service.ts` orchestrates — calls queries, makes decisions, dispatches jobs
- `queries.ts` returns data — no side effects, no job dispatch
- `jobs.ts` dispatches only — type-safe job creation using contracts from `packages/shared`

### State Machine Pipeline (NOT FlowProducer)

Book processing is a **multi-stage state machine**, not a BullMQ FlowProducer:

```
Status: uploading → splitting → generatingBible → illustrating → assembling → published
                                                                            ↘ failed
```

Each handler completes → dispatches the next stage's job(s). Chapter fan-out is dynamic (N unknown until splitter runs).

Chapter completion uses atomic Postgres counter:
```sql
UPDATE books SET completed_chapters = completed_chapters + 1
WHERE id = $bookId RETURNING completed_chapters, expected_chapters
```

**NEVER use `FlowProducer`** for this pipeline — chapter count is unknown at dispatch time.

---

## When Working in `apps/api/`

### Express + tRPC Hybrid
- tRPC handles ALL typed procedures at `/api/trpc/*`
- Express raw routes handle ONLY: `POST /api/upload` (multer) and `GET /api/progress/:bookId` (SSE)
- **NEVER add new Express raw routes** unless the feature cannot be expressed as a tRPC procedure (file uploads, streaming)

### Auth Middleware
- Production: `@clerk/express` middleware verifies JWT, extracts `userId`
- Development: When `NODE_ENV=development`, skip Clerk and inject mock user (`userId: 'dev-user-001'`)
- tRPC context receives `userId` from auth middleware — all procedures have access via `ctx.userId`

### Logging
- Use `pino-http` middleware on Express — automatic request/response logging
- Access logger via `req.log` in Express routes or inject pino instance into services
- Log level: `debug` in dev, `info` in production
- **NEVER use `console.log`** — always use pino

### Error Handling
- Import `express-async-errors` at the top of server.ts — enables async error handling
- Throw errors in services/routes — they propagate to Express error handler
- tRPC has its own error handling via `TRPCError`

---

## When Working in `apps/web/`

### Component Patterns
- Use Mantine components — **NEVER install other UI libraries** (no Chakra, no MUI, no Ant Design)
- Use `@mantine/form` for forms — not Formik, not react-hook-form
- Use `@trpc/react-query` hooks for data fetching — not fetch, not axios, not SWR
- Use TanStack Router for routing — not React Router

### Auth (Headless Clerk)
- Use Clerk's headless hooks (`useSignIn`, `useSignUp`, `useUser`, `useAuth`)
- Build auth UI with **Mantine form components** — NEVER use Clerk's pre-built `<SignIn />` or `<SignUp />` components
- Wrap protected routes with Clerk's auth guards

### tRPC Client
- Setup in `src/trpc.ts` — creates typed client from API's router type
- Use `trpc.books.list.useQuery()` pattern — fully typed, no manual type annotations needed
- Mutations: `trpc.books.process.useMutation()` with `onSuccess`/`onError` callbacks

### Real-Time Progress
- SSE via `EventSource` to `GET /api/progress/:bookId`
- Wrap in a custom hook: `useBookProgress(bookId)` → returns `{ status, progress, currentStep }`
- Display with Mantine `<Progress />` component

---

## When Working in `apps/worker/`

### Job Handlers
- One handler per job type in `src/handlers/`
- Each handler receives typed payload from `packages/shared/src/jobs/contracts.ts`
- On completion, handler dispatches next stage (if applicable) — see state machine pattern above
- **ALWAYS update book status in Postgres** when transitioning stages

### AI Service Wrappers
- Located in `src/services/` (groq.ts, pollinations.ts, storage.ts)
- Every AI API response MUST be parsed through a Zod schema from `packages/shared/src/ai/schemas.ts`
- Implement retry logic with exponential backoff for AI API calls
- Concurrency: max 2-3 concurrent workers via BullMQ settings

### Orchestrator
- `src/orchestrator.ts` manages stage transitions
- Handlers call orchestrator methods: `orchestrator.onSplitComplete(bookId, chapters)`
- Orchestrator dispatches next-stage jobs and updates book status atomically

---

## When Working in `packages/shared/`

### Database Schemas (`src/db/`)
- `schema.ts`: Drizzle `pgTable` definitions — this is the source of truth
- `index.ts`: Auto-generated Zod schemas via `drizzle-zod` + manual extensions
- When adding a new table: define it in schema.ts, export Zod schemas from index.ts
- **NEVER define types manually** that can be derived from Drizzle schemas

### Job Contracts (`src/jobs/contracts.ts`)
- Maps BullMQ job names → Zod payload schemas
- Both API (producer) and worker (consumer) import from here
- Example: `SplitChaptersPayloadSchema = z.object({ bookId: z.string().uuid(), fileUrl: z.string().url() })`

### AI Schemas (`src/ai/schemas.ts`)
- Zod schemas for parsing AI model responses
- Covers: chapter split results, style bible format, scene descriptions
- Used by worker handlers to validate AI outputs before processing

---

## Anti-Patterns (NEVER Do These)

| ❌ Don't | ✅ Do Instead |
|---|---|
| Use `any` type | Use `unknown` + Zod `.parse()` |
| Use `as` type assertions (outside tests) | Use Zod runtime parsing |
| Use `console.log` | Use pino logger |
| Use ESLint or Prettier | Use Biome |
| Use Fastify | Use Express |
| Use React Router | Use TanStack Router |
| Use tRPC v11 | Use tRPC v10 |
| Use Redux, Zustand, or other state managers | Use @trpc/react-query |
| Use Supabase JS client | Use Drizzle ORM with direct Postgres connection |
| Use BullMQ FlowProducer for the book pipeline | Use multi-stage state machine pattern |
| Use Clerk `<SignIn />`/`<SignUp />` components | Use headless Clerk hooks + Mantine forms |
| Use fetch/axios for API calls in frontend | Use tRPC client hooks |
| Use Formik or react-hook-form | Use @mantine/form |
| Put business logic in tRPC router.ts | Put it in service.ts |
| Put job dispatch in queries.ts | Put it in jobs.ts |
| Define types manually when derivable from DB | Derive from Drizzle schema via drizzle-zod |
| Use dotenv without validation | Use @t3-oss/env-core with Zod schemas |
| Add new raw Express routes for typed data | Use tRPC procedures |
| Use kebab-case for filenames | Use camelCase for filenames |

---

## Environment Variables

All env vars are validated at startup via `@t3-oss/env-core` + Zod. If any required var is missing or malformed, the app **crashes immediately** with a clear error.

Each app has its own `env.ts` file defining its required variables:
- `apps/api/src/env.ts` — DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, R2 credentials
- `apps/worker/src/env.ts` — DATABASE_URL, REDIS_URL, GROQ_API_KEY, R2 credentials
- `apps/web/src/env.ts` — VITE_CLERK_PUBLISHABLE_KEY, VITE_API_URL

**NEVER access `process.env` directly** — always import from the app's `env.ts`.

---

## Testing Conventions

- Use **Vitest** for all tests — not Jest
- Test files: `*.test.ts` co-located with source (e.g., `service.test.ts` next to `service.ts`)
- Use Vitest's built-in mocking (`vi.mock`, `vi.fn`)
- Test services by mocking queries and job dispatch — don't test through tRPC layer
- Test tRPC procedures via `createCaller` for integration tests

---

## Reference Documents

- **Full technical specification:** [`plans/technical-specification.md`](plans/technical-specification.md)
- **Original concept (superseded):** [`plans/plan.stage0.md`](plans/plan.stage0.md)
- **Architecture diagram (needs update):** [`plans/illustrated_book_saas_architecture.svg`](plans/illustrated_book_saas_architecture.svg)
