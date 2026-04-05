# Illustration Flow Redesign — Implementation Plan

## Overview

Transform the fully-automated pipeline into a **semi-interactive workflow** where AI prepares chapters and scenes, but the user controls illustration selection and publishing.

**Current flow:** Upload → (auto) Analyze → Split → Anchor → Illustrate all → Assemble → Done
**New flow:** Upload → (auto) Analyze → Split → Anchor → Prepare scenes → **STOP** → (user) Browse chapters → Select scenes → Generate variants → Pick images → Save → Publish

---

## Phase 1: Database Migration

New migration: `0002_interactive_flow.sql`

### 1.1 Modify `books` table

- Update `status` valid values:
  ```
  OLD: pending | analyzing | splitting | anchoring | illustrating | assembling | done | error
  NEW: pending | analyzing | splitting | anchoring | preparing_scenes | ready | publishing | done | error
  ```
  (D1/SQLite uses TEXT, no enum constraint — this is a code-level change)

### 1.2 Modify `chapters` table — add `status` column

```sql
ALTER TABLE chapters ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
-- valid: draft | editing | illustrated
```

### 1.3 New `scenes` table

Stores AI-prepared key scenes (2-3 per chapter). Replaces the single `keyScene` that was computed inline during `illustrateBatch`.

```sql
CREATE TABLE IF NOT EXISTS scenes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id          INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  ordinal             INTEGER NOT NULL,        -- 1, 2, or 3 within the chapter
  description         TEXT NOT NULL,           -- narrative description
  visual_description  TEXT NOT NULL,           -- visual/prompt-ready description
  entities            TEXT NOT NULL,           -- JSON array of entity names
  setting             TEXT NOT NULL,
  mood                TEXT NOT NULL,
  insert_after_para   INTEGER NOT NULL,        -- 0-based paragraph index
  selected            INTEGER NOT NULL DEFAULT 0, -- boolean: user selected this for final book
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chapter_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id);
```

### 1.4 New `scene_variants` table

Stores all generated image variants (persisted permanently).

```sql
CREATE TABLE IF NOT EXISTS scene_variants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id        INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  r2_key          TEXT NOT NULL,              -- e.g. "books/{bookId}/scenes/{sceneId}/v{n}.webp"
  prompt          TEXT NOT NULL,              -- the prompt used to generate this variant
  width           INTEGER,
  height          INTEGER,
  bytes           INTEGER,
  validation_score REAL,                      -- 0-1 quality score from Gemini vision
  selected        INTEGER NOT NULL DEFAULT 0, -- boolean: user picked this variant
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_variants_scene ON scene_variants(scene_id);
```

### 1.5 Drop dependency on old `anchors` and `illustrations` tables

The old `anchors` table (one anchor per chapter) and `illustrations` table (one image per chapter) are replaced by the multi-scene model above. We'll keep them in the schema for backward compat with existing books but new code won't write to them.

---

## Phase 2: Backend — Schemas & Prompts

### 2.1 New Zod schemas

**`schemas/scenes.ts`:**
```typescript
export const SceneSchema = z.object({
  description: z.string(),          // narrative description
  visualDescription: z.string(),    // visual/prompt-ready description
  entities: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  insertAfterParagraph: z.number().int().nonnegative(),
});

export const ScenesResultSchema = z.object({
  scenes: z.array(SceneSchema).min(2).max(3),
});
```

### 2.2 New prompt: `prompts/findKeyScenes.ts` (plural)

Replace `findKeyScene.ts` (singular) with a new prompt that returns 2-3 scenes per chapter, each with both a narrative and visual description. The prompt structure follows the existing pattern but requests multiple scenes.

### 2.3 Update `schemas/chapters.ts`

- `KeySceneSchema` — keep for backward compat but mark as deprecated
- Export new `SceneSchema` from `schemas/index.ts`

---

## Phase 3: Backend — Workflow Changes

### 3.1 New workflow step: `prepareScenes.step.ts`

Runs after anchoring. For each chapter in parallel (batched like current `illustrateBatch`):
1. Call Gemini with `findKeyScenesPrompt(chapter, bible)` → returns 2-3 scenes
2. Insert rows into `scenes` table
3. Set chapter status = `draft`

This step runs **all chapters in parallel** (batched by `CHAPTER_CONCURRENCY`).

### 3.2 Modify `workflow/index.ts` — truncate pipeline

The workflow now has 4 durable steps (was 6):

```
1. read-book           → fetch text from R2, set status: analyzing
2. analyze-and-split   → bible + chapters, set status: splitting
3. anchor-{name}       → anchor portraits, set status: anchoring
4. prepare-scenes-batch-{n} → 2-3 scenes per chapter, set status: preparing_scenes
```

After step 4 completes → set book status to `ready` → **workflow ends**.

Remove steps: `illustrateBatch`, `assemble`, `finalize` from the workflow.
(Keep the code — `assemble` and `finalize` will be reused in the Publish API.)

### 3.3 Add `makeSetStatus` calls

New status values: `preparing_scenes`, `ready`.

---

## Phase 4: Backend — New API Endpoints

### 4.1 `GET /api/books/:id/chapters` — **modify existing**

Return richer data including chapter status and scene count:
```typescript
interface ChapterMeta {
  id: number;
  number: number;
  title: string;
  content_preview: string;   // first ~200 chars of content
  status: 'draft' | 'editing' | 'illustrated';
  scene_count: number;
  illustration_count: number; // how many scenes have a selected variant
}
```

### 4.2 `GET /api/books/:id/chapters/:num` — **new**

Returns full chapter detail for the chapter page:
```typescript
interface ChapterDetail {
  id: number;
  number: number;
  title: string;
  content: string;             // full text
  status: 'draft' | 'editing' | 'illustrated';
  scenes: SceneDetail[];
}

interface SceneDetail {
  id: number;
  ordinal: number;
  description: string;
  visual_description: string;
  entities: string[];
  setting: string;
  mood: string;
  insert_after_para: number;
  selected: boolean;
  variants: VariantDetail[];
}

interface VariantDetail {
  id: number;
  image_url: string;          // /api/books/:id/variants/:variantId/img
  validation_score: number | null;
  selected: boolean;
  created_at: string;
}
```

### 4.3 `POST /api/books/:id/chapters/:num/generate` — **new**

Triggers image generation for selected scenes.

**Request body:**
```json
{
  "scene_ids": [1, 3],
  "variant_count": 2
}
```

**Behavior:**
1. Validate scene_ids belong to this chapter
2. Load bible + anchor images for referenced entities
3. For each scene × variant_count: generate image, run validation (return score as hint), optimize, store in R2, insert into `scene_variants`
4. Return generated variants

**Response:**
```json
{
  "results": [
    {
      "scene_id": 1,
      "variants": [
        { "id": 10, "image_url": "...", "validation_score": 0.85 },
        { "id": 11, "image_url": "...", "validation_score": 0.72 }
      ]
    }
  ]
}
```

This is a **hybrid** approach: direct API call, but all results persist in DB/R2. The endpoint may take 30-60s, so the frontend should handle this with appropriate loading state. If generation fails partway, partial results are still saved.

### 4.4 `POST /api/books/:id/chapters/:num/save` — **new**

Saves the user's image selections for a chapter.

**Request body:**
```json
{
  "selections": [
    { "scene_id": 1, "variant_id": 10 },
    { "scene_id": 3, "variant_id": null }
  ]
}
```

`variant_id: null` means the user chose not to illustrate this scene. Passing an empty `selections` array (or omitting scenes) saves the chapter without illustrations.

**Behavior:**
1. Transaction: clear all `selected` flags on this chapter's scenes/variants
2. Set `selected = 1` on each chosen scene + variant
3. Set chapter status → `illustrated`
4. Update book `updated_at`

### 4.5 `POST /api/books/:id/chapters/:num/edit` — **new**

Sets chapter status to `editing` (from `illustrated`). Returns updated chapter.

### 4.6 `POST /api/books/:id/publish` — **new**

Triggers assembly of the final book.

**Precondition:** All chapters must have status `illustrated`. Return 409 if not.

**Behavior:**
1. Set book status → `publishing`
2. For each chapter: find selected scenes + selected variants → build illustration placement data
3. Call `assembleStep()` (reuse existing assembly logic, adapted for multi-scene model)
4. Call `finalizeStep()` → set status `done`, cache invalidation
5. Return `{ html_r2_key: "..." }`

### 4.7 `GET /api/books/:id/variants/:variantId/img` — **new**

Streams a variant image from R2 (like the existing chapter img endpoint).

### 4.8 `GET /api/books/:id/progress` — **new** (or add fields to `GET /api/books/:id`)

Returns book status + chapter-level summary for the dashboard:
```json
{
  "id": "abc123",
  "status": "ready",
  "total_chapters": 12,
  "illustrated_chapters": 5,
  "editing_chapters": 1,
  "draft_chapters": 6
}
```

---

## Phase 5: Backend — DB Access Layer

### 5.1 New files

- **`db/scene.db.ts`** — `insertScenes()`, `getScenesByChapter()`, `updateSceneSelection()`
- **`db/variant.db.ts`** — `insertVariant()`, `getVariantsByScene()`, `updateVariantSelection()`, `clearChapterSelections()`

### 5.2 Modify existing

- **`db/chapter.db.ts`** — add `updateChapterStatus()`, modify `getChaptersByBook()` to include status + scene count, add `getChapterByNumber()` with full content + scenes + variants
- **`db/book.db.ts`** — add `getBookProgress()` query (counts by chapter status)

---

## Phase 6: Frontend — API Client Updates

### 6.1 Update `api/client.ts`

Add types and methods:
```typescript
// New types
interface ChapterMeta { /* as in 4.1 */ }
interface ChapterDetail { /* as in 4.2 */ }
interface SceneDetail { /* ... */ }
interface VariantDetail { /* ... */ }
interface BookProgress { /* as in 4.8 */ }
interface GenerateRequest { scene_ids: number[]; variant_count: number; }
interface GenerateResult { results: { scene_id: number; variants: VariantDetail[] }[] }
interface SaveRequest { selections: { scene_id: number; variant_id: number | null }[] }

// New methods
api.getBookProgress(id)        → Promise<BookProgress>
api.getChapter(bookId, num)    → Promise<ChapterDetail>
api.generateImages(bookId, num, req) → Promise<GenerateResult>
api.saveChapter(bookId, num, req)    → Promise<ChapterDetail>
api.editChapter(bookId, num)         → Promise<ChapterDetail>
api.publishBook(id)                  → Promise<{ html_r2_key: string }>
api.variantImgUrl(bookId, variantId) → string
```

Update `Book.status` type to include new statuses: `preparing_scenes | ready | publishing`.

---

## Phase 7: Frontend — New Pages & Components

### 7.1 Route changes in `main.tsx`

```
/                       → Home (upload) — unchanged
/books                  → BookList — unchanged
/books/:id              → BookDetail — REWORKED (grid + dashboard)
/books/:id/chapters/:num → ChapterPage — NEW
/books/:id/read         → BookReader — unchanged
```

### 7.2 `BookDetail.tsx` — major rework

**Layout:** Two-panel layout.

**Left panel (main area):**
- During automation (`pending` → `preparing_scenes`): show the current pipeline stepper (as now)
- Once `ready`: show 3-column chapter card grid
- Chapter cards: number, title, content preview (~2 lines), status badge (draft/editing/illustrated)
- Click card → navigate to `/books/:id/chapters/:num`
- When all chapters are `illustrated`: show **"Publish"** button at top of grid
- Publish button → calls `api.publishBook()` → book transitions to `publishing` → `done` → redirect to reader

**Right panel (sidebar dashboard):**
- **Pipeline progress** section (top): step indicator, same as current but with updated step labels:
  1. Analyzing
  2. Splitting chapters
  3. Building anchor images
  4. Preparing scenes
  5. Ready for illustration
- **Chapter progress** section (below): appears once chapters exist
  - Progress bar: `X / Y chapters illustrated`
  - Mini counts: `Draft: N | Editing: N | Illustrated: N`

**Polling:**
- During automation: poll `GET /api/books/:id` every 3s (for status changes)
- Once `ready`: poll `GET /api/books/:id/progress` every 5s (for chapter counts, no page reload)
- Grid data: fetch `GET /api/books/:id/chapters` once on entering `ready` state (and after saves)

### 7.3 `ChapterPage.tsx` — new page

**Layout:** Two-panel (left: text, right: scenes).

**Left panel:**
- Chapter number + title (header)
- Full chapter text (scrollable, paragraphs rendered with `<p>` tags)
- If chapter has saved illustrations, show them inline at their `insert_after_para` positions

**Right panel — scene list:**
- Each scene card shows:
  - Ordinal badge (Scene 1, Scene 2, Scene 3)
  - Narrative description
  - Visual description (lighter/italic text)
  - Entities tags
  - Mood + Setting metadata
  - Checkbox to select scene for generation
  - If variants exist: thumbnail gallery grid
  - If a variant is selected: highlighted border
  - Validation score badge on each variant thumbnail

**Actions bar (bottom of right panel):**
- **Variant count selector:** dropdown or number input (1-4)
- **"Generate" button:** enabled when ≥1 scene is checked. Shows loading spinner per scene during generation. Disabled while generating.
- **"Save" button:** enabled when at least one chapter scene interaction has happened (even if no images selected — saving without images is valid). Saves selections, sets chapter → `illustrated`.
- **"Back to book" link:** navigates to `/books/:id`

**Chapter status transitions on this page:**
- Entering page for an `illustrated` chapter → auto-call `api.editChapter()` → status becomes `editing`
- Clicking "Save" → `api.saveChapter()` → status becomes `illustrated`
- Leaving without saving → status stays `editing` (which is fine — user can come back)

### 7.4 Component breakdown

```
BookDetail/
  BookDetail.tsx          — main layout, polling, state management
  PipelineStepper.tsx     — reusable step indicator (extracted from current BookDetail)
  ChapterGrid.tsx         — 3-col grid of chapter cards
  ChapterCard.tsx         — individual card (number, title, preview, status badge)
  ProgressDashboard.tsx   — sidebar with pipeline + chapter progress

ChapterPage/
  ChapterPage.tsx         — main layout, data fetching
  ChapterText.tsx         — left panel: text + inline illustrations
  SceneList.tsx           — right panel: scene cards + actions
  SceneCard.tsx           — individual scene with metadata + variants
  VariantGallery.tsx      — thumbnail grid for one scene's variants
  VariantThumbnail.tsx    — single variant image + score badge
  GenerateControls.tsx    — variant count + generate/save buttons
```

---

## Phase 8: Assembly Adaptation

### 8.1 Modify `assemble.step.ts`

The assembly logic needs to work with the new multi-scene data model:
- Instead of one illustration per chapter, collect all **selected** scenes with their **selected** variants
- For each selected scene: place the variant image at its `insert_after_para` position
- Multiple images per chapter are now possible (if user selected 2-3 scenes)
- Order images by `insert_after_para` ascending within each chapter
- Fetch variant images from their R2 keys (instead of the old `illustrations` table)

### 8.2 Reuse in Publish endpoint

The publish endpoint (`POST /api/books/:id/publish`) calls the adapted assembly logic directly (not via Workflow), since it's a user-triggered one-shot action.

---

## Phase 9: Cleanup & Migration Path

### 9.1 Backward compatibility

- Existing books (created before migration) keep their old status values
- BookList page should handle both old (`illustrating`, `assembling`) and new statuses gracefully
- Old `anchors` + `illustrations` tables remain in schema but are not used for new books

### 9.2 Remove dead code

After the new flow is complete:
- Delete `illustrateBatch.step.ts` (illustration is now user-driven API calls)
- Delete `findKeyScene.ts` (singular) prompt — replaced by `findKeyScenes.ts` (plural)
- Clean up old `EnrichedChapter` / `BookResult` schemas if no longer used

---

## Implementation Order

| Step | Description | Depends on |
|------|-------------|------------|
| 1 | DB migration (`0002_interactive_flow.sql`) | — |
| 2 | New Zod schemas (`scenes.ts`) | — |
| 3 | New prompt (`findKeyScenes.ts`) | 2 |
| 4 | DB access layer (`scene.db.ts`, `variant.db.ts`, updates) | 1 |
| 5 | New workflow step (`prepareScenes.step.ts`) | 3, 4 |
| 6 | Modify `workflow/index.ts` — truncate pipeline | 5 |
| 7 | New API endpoints (chapters detail, generate, save, edit, publish, progress) | 4, 6 |
| 8 | Adapt `assemble.step.ts` for multi-scene model | 4 |
| 9 | Frontend API client updates | 7 |
| 10 | Frontend: rework `BookDetail.tsx` (grid + dashboard) | 9 |
| 11 | Frontend: new `ChapterPage.tsx` | 9 |
| 12 | Frontend: route updates in `main.tsx` | 10, 11 |
| 13 | Integration testing & cleanup | all |

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Generation approach | Hybrid (direct API, persisted) | Simple for user, results survive browser close |
| Variant count | User-configurable (1-4) | Maximum flexibility |
| Publish precondition | All chapters illustrated | Quality control |
| Validation | Show score as hint | User has final say, but AI guidance helps |
| Re-illustration | Status → editing | Clear state machine, user must explicitly save |
| Workflow boundary | Stops after scene prep | Clean separation of auto vs interactive |
| Variant storage | Persist all permanently | User can revisit and change selections |
| Image placement | AI-determined paragraph index | Precise placement, consistent with current approach |
| Chapter card thumbnails | Status badge only | Cleaner grid, less visual noise |
| Progress display | Pipeline steps + chapter counts | Full visibility at all times |
