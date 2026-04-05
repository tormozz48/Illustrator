# Illustrator (bookillust) — Agent Guide

## Project Purpose

CLI tool that transforms plain-text books into illustrated HTML books using Google Gemini AI. Input: a `.txt` file. Output: a self-contained HTML file with AI-generated illustrations embedded as base64 images.

## Commands

```bash
npm run dev        # Run CLI in dev mode (tsx, no build needed)
npm run build      # Bundle to dist/index.js (ESM, with .d.ts)
npm run typecheck  # Type-check without emitting
npm run lint       # Biome lint check
npm run lint:fix   # Auto-fix lint issues
npm run format     # Biome format (write)
npm run clean      # rm -rf output/
```

## Tech Stack

- **Runtime:** Node.js 20+, ESM only
- **Language:** TypeScript 5.7 (strict)
- **AI:** `@google/genai` (Gemini) — text + image generation
- **CLI:** `commander`
- **Validation:** `zod`
- **UI:** `chalk`, `ora`
- **Image processing:** `jimp`
- **Concurrency:** `p-map`
- **Templating:** `eta`
- **Build:** `tsup`
- **Lint/Format:** `biome` (single quotes, 100 char lines, 2-space indent, ES5 trailing commas)

## Code Conventions

- All modules use named exports; no default exports
- Zod schemas defined in `src/schemas/` (split by domain); import from `src/schemas/index.ts`; types inferred with `z.infer<>`
- Prompts are pure functions in `src/prompts/` — keep AI prompt logic isolated there
- No `any`; no non-null assertions (biome enforces this)
- Unused variables are errors, not warnings
- Import types with `import type` where possible
- In every `.ts` file, place exported functions before non-exported (private) functions
- Functions that accept more than 2 arguments must use an options object instead of positional parameters. This applies to exported and non-exported functions alike.

## Project Structure

```
src/
  index.ts          # CLI entry (Commander)
  config.ts         # Env config (Zod)
  schemas/          # Zod schemas split by domain
    bible.ts        #   Character & Style Bible
    chapters.ts     #   Chapters & Scenes
    config.ts       #   App config
    illustrations.ts#   Illustrations & output
    validation.ts   #   Image validation
    index.ts        #   Single re-export point
  gemini.ts         # Gemini API client
  pipeline/         # 5-stage pipeline
  prompts/          # AI prompt templates
  templates/        # book.eta HTML template
docs/               # Architecture, decisions, roadmap
story.txt           # Sample input for testing
output/             # Generated books (gitignored)
```

## Comments

Only write comments that explain **why** — non-obvious decisions, constraints, or trade-offs. Never write comments that describe **what** the code does (the code already says that). Only comment tricky places where the reasoning isn't obvious from reading the code.

Examples of acceptable comments:
- Why a retry has no backoff (Gemini is non-deterministic, plain retry works)
- Why two calls run in parallel (they're independent, saves wall-clock time)
- Why a guard exists for a guaranteed condition (TypeScript strict-mode narrowing limitation)

Examples of comments to avoid:
- `// Strip markdown code fences` (the regex shows this)
- `// Resolve entity descriptions` (the filter/map shows this)
- Section headers like `// ── Stage 1: Read ──`

## Gotchas

- Output directory and `dist/` are gitignored; don't commit generated artifacts.
- The HTML output embeds images as base64 — can be large for books with many chapters and high concurrency.
- Gemini image generation is rate-limited; keep `--concurrency` low (≤3) unless you have a paid quota.
- `src/templates/book.eta` uses ETA syntax (`<%= %>`, `<% %>`); not Handlebars or Mustache.

## API Layer (`apps/api`)

The API is split into three layers:

### Routes (`apps/api/src/api/*.ts`)
Responsible for request parsing, input validation, calling the service layer, and formatting HTTP responses. No direct DB calls or business logic here.

### Services (`apps/api/src/api/*.service.ts`)
Contain business logic and orchestrate DB + storage operations. Route handlers import exclusively from service files — never directly from `db/` or `workflow/`.

| File | Responsibility |
|---|---|
| `books.service.ts` | Book upload, HTML fetch (with KV cache), publish flow, deletion with R2 cleanup |
| `chapters.service.ts` | Chapter detail queries, image variant generation via Gemini, save/edit chapter state |

### Database Layer (`apps/api/src/db/`)

All D1 SQL lives in `apps/api/src/db/`, one file per table. No raw `DB.prepare()` calls outside of these files.

| File | Table | Exported functions |
|---|---|---|
| `book.db.ts` | `books` | `insertBook`, `listBooks`, `getBook`, `getBookReadInfo`, `getBookR2Keys`, `getBookMeta`, `updateBookStatus`, `markBookDone`, `deleteBook` |
| `bible.db.ts` | `bibles` | `upsertBible` |
| `chapter.db.ts` | `chapters` | `insertChapters`, `getChapterId`, `listChaptersWithMeta`, `listChaptersForAssemble` |
| `anchor.db.ts` | `anchors` | `upsertAnchor` |
| `illustration.db.ts` | `illustrations` | `upsertIllustration`, `getIllustrationR2Key`, `listIllustrationR2KeysByBook` |
| `job.db.ts` | `jobs` | `insertJob`, `markJobComplete`, `markJobErrored` |
| `scene.db.ts` | `scenes`, `scene_variants` | `insertScenes`, `getScenesByChapterId`, `getSceneById`, `getVariantsBySceneId`, `getVariantById`, `insertVariant`, `saveChapterSelections`, `getSelectedScenesForChapter`, `listVariantR2KeysByBook` |

Rules:
- Add new queries to the matching `*.db.ts` file. If a query spans multiple tables, put it in the file for the primary (driving) table.
- `chapter.db.ts` owns the complex LEFT JOIN queries over `chapters + anchors + illustrations` — `listChaptersWithMeta` (API use, no content) and `listChaptersForAssemble` (workflow use, includes content).
- `workflow/setStatus.ts` is a thin factory over `bookDb.updateBookStatus`; keep it for ergonomics in step files.
