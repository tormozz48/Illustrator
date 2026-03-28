This is a rich problem — let me think through the full architecture, model choices, consistency strategy, and deployment options.

## AI Model Selection (Free / Cheapest)

**Text processing (chapter splitting, key scene extraction):** Groq offers free API access to Llama 3.3 70B and Mixtral — fast and capable enough for text analysis. HuggingFace Inference API also provides free access to Mistral and Llama models. Fallback to Claude Sonnet only if quality is insufficient.

**Image generation (illustrations):** This is the hardest part for free. Your realistic options are: HuggingFace Inference API (free tier gives you Stable Diffusion XL), Pollinations.ai (fully free, API-based, supports SDXL and Flux), and Together AI free tier (some image models). For best consistency, Flux models via Pollinations or HuggingFace are the strongest free option.

## The Consistency Problem — This Is the Core Challenge

Keeping characters and backgrounds visually consistent across chapters is unsolved even in commercial tools. Here's a practical strategy:

**Style Guide Generation step** — before processing chapters, use the LLM to extract all characters with detailed physical descriptions (hair color, build, clothing, distinguishing features) and recurring locations. This becomes a "visual bible" prepended to every image prompt.

**Prompt engineering for consistency** — every image prompt follows a rigid template: `[art style directive] + [character description from bible] + [scene action] + [background description from bible] + [technical params]`. The art style directive stays identical across all chapters (e.g., "digital illustration, watercolor style, warm palette, soft lighting, storybook aesthetic").

**Seed pinning** — where the API supports it (Stable Diffusion based), use consistent seeds for similar scene types. This helps but isn't magic.

**Realistic expectation** — with free models, you'll get "stylistically similar" rather than "pixel-perfect consistent." True consistency requires either fine-tuned models (LoRA trained on your characters) or IP-Adapter with reference images, both of which need GPU compute that isn't free. A practical middle ground: generate the first chapter's hero image, then use img2img / image-to-image with that as a reference for subsequent chapters (supported by some free APIs).

## Tech Stack & Architecture

Let me lay out the system visually:Here's the system architecture:Now let me walk through the pipeline for Feature 3 in detail:

## The Chapter Processing Pipeline

**Step 1 — Upload & parse.** User uploads a `.txt` file. The API stores the raw file in R2/S3 and creates a `book` record in Postgres with status `processing`.

**Step 2 — Chapter splitting.** A "splitter" job runs first. It sends the full text to Groq (Llama 3.3 70B, free tier: ~6000 req/day) with a prompt like: "Split this text into chapters. Return JSON with chapter titles and the start/end character offsets." The LLM handles edge cases like unnumbered chapters, prologues, epilogues. Each detected chapter gets a DB row and spawns a parallel worker job.

**Step 3 — Style bible generation (crucial for consistency).** Before chapter workers run, a single "style bible" job extracts all recurring characters and locations into a structured document: name, physical description, clothing, personality keywords. This is stored on the book record and passed to every subsequent prompt. This is the single most important step for visual consistency.

**Step 4 — Parallel chapter processing.** Each BullMQ worker does two things per chapter: first, calls the LLM to identify the key scene (a 2-3 sentence vivid description of the most visually compelling moment), then calls the image API with a prompt built from `[style directive] + [character descriptions from bible] + [scene description] + [technical params]`. The style directive is fixed per book, e.g. "Digital watercolor illustration, warm tones, soft brush strokes, storybook aesthetic, consistent character proportions."

**Step 5 — Assembly.** Once all chapter jobs complete (tracked via BullMQ's job dependency or a simple counter), the assembler combines everything into a structured JSON/HTML document with chapter navigation, embedded base64 images (or R2 URLs), and updates the book status to `published`.

## Book Storage Format

I'd recommend storing the book as structured JSON in Postgres (chapters array, each with `title`, `content` as markdown, `imageUrl`, `imageCaption`). The React reader component renders this on the fly — no need for a complex format like EPUB unless you want export capability later. If you do want EPUB export, the `epub-gen` npm package can convert your JSON structure.

## Deployment Options (Free → Cheap)

**Railway** is the best fit here. Free tier gives you 500 hours/month, supports multiple services (API + workers from one repo), has built-in Redis addon, and connects to Supabase. The key constraint: workers are CPU/memory hungry during image generation waits, but since you're calling external APIs (not running local models), the compute is minimal — you're mostly waiting on HTTP responses.

**Alternative breakdown:** Vercel for the React frontend (free), Railway or Render for the API + workers (free tier), Supabase for Postgres (free: 500MB), Cloudflare R2 for image storage (free: 10GB), Upstash for Redis/BullMQ (free: 10k commands/day — tight, may need paid at ~$10/mo for real usage).

**Realistic cost at small scale:** $0-10/month. The bottleneck is the AI APIs: Groq free tier has rate limits (~30 req/min), and free image generation APIs are slow (5-15 seconds per image) and rate-limited. For a book with 20 chapters, expect 3-5 minutes total processing time.

## Key Technical Decisions

**Image generation API choice matters most.** Pollinations.ai is fully free with no API key, supports Flux models, and allows seed control — making it the strongest free option for consistency. HuggingFace Inference API is the fallback (free but slower, queue-based). Together AI gives 25 free credits that go fast.

**The "good enough" consistency approach:** Generate a reference image for the protagonist in chapter 1. Store its generation parameters (seed, prompt). For subsequent chapters, always include the same character description verbatim and use the same seed offset strategy. You won't get identical faces, but you'll get recognizably similar style and proportions. This is an honest trade-off — perfect consistency requires fine-tuning or LoRA training which isn't free.

**Queue design:** Use BullMQ with concurrency limited to 2-3 workers to stay within API rate limits. Each chapter job should retry on failure with exponential backoff. The splitter and style-bible jobs are dependencies that must complete before chapter jobs start.

Want me to scaffold the project structure and start building any part of this?

see [archiecture schema](illustrated_book_saas_architecture.svg)