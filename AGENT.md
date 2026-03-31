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
- Zod schemas defined in `src/schemas.ts`; types inferred with `z.infer<>`
- Prompts are pure functions in `src/prompts/` — keep AI prompt logic isolated there
- No `any`; no non-null assertions (biome enforces this)
- Unused variables are errors, not warnings
- Import types with `import type` where possible
- In every `.ts` file, place exported functions before non-exported (private) functions

## Project Structure

```
src/
  index.ts          # CLI entry (Commander)
  config.ts         # Env config (Zod)
  schemas.ts        # All Zod schemas
  gemini.ts         # Gemini API client
  pipeline/         # 5-stage pipeline
  prompts/          # AI prompt templates
  templates/        # book.eta HTML template
docs/               # Architecture, decisions, roadmap
story.txt           # Sample input for testing
output/             # Generated books (gitignored)
```

## Gotchas

- Output directory and `dist/` are gitignored; don't commit generated artifacts.
- The HTML output embeds images as base64 — can be large for books with many chapters and high concurrency.
- Gemini image generation is rate-limited; keep `--concurrency` low (≤3) unless you have a paid quota.
- `src/templates/book.eta` uses ETA syntax (`<%= %>`, `<% %>`); not Handlebars or Mustache.
