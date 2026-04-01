# Feature Roadmap — Illustrated Book Generator

> See [decisions.md](./decisions.md) for all accepted technology choices.

## Phases Overview

```mermaid
gantt
    title Development Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %b %Y

    section Phase 1: CLI MVP (OpenRouter)
    Project setup (npm, tsup, Biome)   :p1a, 2026-04-01, 2d
    OpenRouterClient module            :p1b, after p1a, 3d
    Bible generation pipeline          :p1c, after p1b, 3d
    Chapter splitting pipeline         :p1d, after p1c, 2d
    Illustration pipeline + validation :p1e, after p1b, 6d
    Consistency strategy impl          :p1f, after p1e, 4d
    HTML assembler (Eta + jimp)        :p1g, after p1d, 3d
    CLI interface (commander)          :p1h, after p1a, 2d
    Integration & testing              :p1i, after p1f, 5d
    MVP complete                       :milestone, after p1i, 0d

    section Phase 2: Static Hosting
    Cloudflare Pages integration       :p2a, after p1i, 3d
    Deploy command & URL output        :p2b, after p2a, 2d

    section Phase 3: Telegram Bot
    Bot scaffolding (grammy)           :p3a, after p2b, 3d
    File upload + progress messaging   :p3b, after p3a, 3d
    Auto-deploy & URL response         :p3c, after p3b, 2d
    Bot hosting (Railway/Fly.io)       :p3d, after p3c, 2d

    section Phase 4: Multi-format Input
    BookReader interface + factory     :p4a, after p3d, 2d
    EPUB parser                        :p4b, after p4a, 3d
    PDF text extraction                :p4c, after p4a, 3d
    DOCX + FB2 parsers                 :p4d, after p4a, 3d

    section Phase 5: Provider Abstraction + Premium
    TextAIProvider interface           :p5a, after p1i, 3d
    ImageProvider interface            :p5b, after p5a, 2d
    Claude text provider               :p5c, after p5a, 2d
    FLUX.2 image provider              :p5d, after p5b, 3d
    Groq + HuggingFace providers       :p5e, after p5d, 3d
```

---

## Phase 1: CLI MVP (OpenRouter)

The minimum viable product: a CLI tool that takes a `.txt` file and produces an illustrated HTML book via OpenRouter. No provider abstraction — direct OpenRouter SDK integration.

### Deliverables

| # | Feature | Description | Priority |
|---|---|---|---|
| 1.1 | Project scaffolding | TypeScript, tsup, npm, commander, Biome | Must |
| 1.2 | OpenRouterClient module | Single module wrapping all AI operations via OpenRouter (text, image, vision) | Must |
| 1.3 | Book reader (.txt) | Read and normalize text files | Must |
| 1.4 | Bible generator | Analyze text → character sheets + style guide (zod schemas) | Must |
| 1.5 | Chapter splitter | Detect and split chapters via OpenRouter | Must |
| 1.6 | Illustrator pipeline | Key scene → prompt → image (parallel with p-map) | Must |
| 1.7 | Consistency engine | Anchor images, prompt templates, multimodal refs via OpenRouter | Must |
| 1.8 | Image validation | Vision validates each illustration vs bible via OpenRouter (default ON) | Must |
| 1.9 | HTML assembler | Eta template → self-contained HTML with ToC + base64 images | Must |
| 1.10 | Image optimization | jimp resize/compress before embedding | Must |
| 1.11 | CLI interface | commander-based CLI with flags and ora progress output | Must |
| 1.12 | Caching | Cache intermediate results (bible, chapters) for retries | Should |
| 1.13 | Error handling | Graceful degradation, retry logic, rate limit handling | Must |

### Architecture for Phase 1

```mermaid
graph LR
    TXT["book.txt"] --> CLI["CLI<br/>(commander + ora)"]
    CLI --> PIPE["Pipeline<br/>(orchestrator)"]
    PIPE --> OR["OpenRouter API<br/>(text + image + vision)<br/>@openrouter/sdk"]
    PIPE --> JIMP["jimp<br/>(resize + compress)"]
    PIPE --> ETA["Eta<br/>(HTML template)"]
    ETA --> HTML["book.html"]
```

### npm Scripts

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Phase 2: Static Hosting Deployment

After generating the HTML bundle, automatically deploy it to a free static host and return a public URL.

### Hosting Decision

```mermaid
graph TD
    HTML["Generated book.html"] --> DEPLOY{"--deploy flag"}
    DEPLOY -->|cloudflare| CF["Cloudflare Pages<br/>via wrangler CLI"]

    CF --> URL1["https://book-abc123.pages.dev"]

    style CF fill:#f9f,stroke:#333
```

| Host | Free Tier | Deployment Method | Status |
|---|---|---|---|
| **Cloudflare Pages** | Unlimited sites, 500 builds/month | `wrangler pages deploy` | **Primary** |
| Vercel | 100 deploys/day | `vercel deploy --prod` | Future option |
| Netlify | 300 build minutes/month | `netlify deploy --prod` | Future option |

Cloudflare Pages is the primary deployment target. Single file upload (the HTML bundle) requires no build process. Additional hosts can be added later.

### CLI Extension

```
$ bookillust generate -i book.txt --deploy
  ✓ Book generated: output/book.html
  ✓ Deployed to: https://book-abc123.pages.dev
```

---

## Phase 3: Telegram Bot

Wrap the same pipeline with a Telegram bot frontend so users can send a book file and receive an illustrated version.

### Bot Flow

```mermaid
sequenceDiagram
    actor User
    participant Bot as Telegram Bot (grammy)
    participant Pipeline
    participant Host as Cloudflare Pages

    User->>Bot: /start
    Bot-->>User: Welcome! Send me a book file (.txt)

    User->>Bot: story.txt
    Bot-->>User: Reading your book...

    Bot->>Pipeline: run(fileBuffer)

    Pipeline-->>Bot: bible ready
    Bot-->>User: Found 4 characters. Generating illustrations...

    Pipeline-->>Bot: chapter 1/8 done
    Bot-->>User: Chapter 1 illustrated (1/8)

    Note over Bot,Pipeline: ... chapters 2-7 ...

    Pipeline-->>Bot: chapter 8/8 done
    Bot-->>User: Chapter 8 illustrated (8/8)

    Pipeline-->>Bot: html ready
    Bot->>Host: deploy(book.html)
    Host-->>Bot: URL

    Bot-->>User: Your illustrated book is ready!<br/>https://book-abc123.pages.dev
```

### Tech Choices

| Component | Library | Notes |
|---|---|---|
| Bot framework | `grammy` | Modern, TypeScript-first Telegram bot framework |
| File handling | grammy file plugin | Download uploaded documents |
| Hosting | Railway or Fly.io | Free tiers for always-on bot process |
| Webhook vs polling | Webhook (prod), polling (dev) | Webhook is more efficient |

---

## Phase 4: Multi-format Input Support

Support additional book file formats beyond `.txt`.

### Reader Architecture

```mermaid
classDiagram
    class BookReader {
        <<interface>>
        +read(filePath: string): Promise~BookContent~
        +supports(ext: string): boolean
    }

    class BookContent {
        title?: string
        author?: string
        rawText: string
        chapters?: RawChapter[]
        metadata?: Record~string, string~
    }

    class TxtReader {
        +read(filePath): Promise~BookContent~
        +supports(ext): boolean
    }

    class EpubReader {
        +read(filePath): Promise~BookContent~
        +supports(ext): boolean
    }

    class PdfReader {
        +read(filePath): Promise~BookContent~
        +supports(ext): boolean
    }

    class DocxReader {
        +read(filePath): Promise~BookContent~
        +supports(ext): boolean
    }

    class Fb2Reader {
        +read(filePath): Promise~BookContent~
        +supports(ext): boolean
    }

    class ReaderFactory {
        -readers: Map~string, BookReader~
        +getReader(filePath: string): BookReader
    }

    BookReader <|.. TxtReader
    BookReader <|.. EpubReader
    BookReader <|.. PdfReader
    BookReader <|.. DocxReader
    BookReader <|.. Fb2Reader
    BookReader --> BookContent
    ReaderFactory --> BookReader
```

| Format | Extension | Library | Priority | Notes |
|---|---|---|---|---|
| Plain text | `.txt` | built-in `fs` | MVP | Already implemented. |
| EPUB | `.epub` | `epub2` or `epubjs` | First | Most common ebook format. Has chapters. |
| PDF | `.pdf` | `pdf-parse` / `pdfjs-dist` | Last | Text extraction quality varies. Hardest. |
| Word | `.docx` | `mammoth` | Second | Structured XML. Good heading detection. |
| FB2 | `.fb2` | `fast-xml-parser` | Second | XML-based. Popular in CIS region. |

---

## Phase 5: Provider Abstraction + Premium

Introduce the provider interface pattern and add alternative AI providers. This is the phase where the abstraction layer from the original design gets built — when there's a real need for it.

### Provider Architecture

```mermaid
classDiagram
    class TextAIProvider {
        <<interface>>
        +analyze(text: string, schema: ZodSchema): Promise~T~
        +chat(messages: Message[]): Promise~string~
    }

    class ImageProvider {
        <<interface>>
        +generate(prompt: string, opts: ImageOpts): Promise~Buffer~
        +generateWithReference(prompt: string, refs: Buffer[], opts: ImageOpts): Promise~Buffer~
    }

    class GeminiProvider {
        +analyze(text, schema): Promise~T~
        +chat(messages): Promise~string~
        +generate(prompt, opts): Promise~Buffer~
        +generateWithReference(prompt, refs, opts): Promise~Buffer~
    }

    class ClaudeTextProvider {
        +analyze(text, schema): Promise~T~
        +chat(messages): Promise~string~
    }

    class GroqTextProvider {
        +analyze(text, schema): Promise~T~
        +chat(messages): Promise~string~
    }

    class FluxImageProvider {
        +generate(prompt, opts): Promise~Buffer~
        +generateWithReference(prompt, refs, opts): Promise~Buffer~
    }

    class HuggingFaceImageProvider {
        +generate(prompt, opts): Promise~Buffer~
        +generateWithReference(prompt, refs, opts): Promise~Buffer~
    }

    TextAIProvider <|.. GeminiProvider
    TextAIProvider <|.. ClaudeTextProvider
    TextAIProvider <|.. GroqTextProvider
    ImageProvider <|.. GeminiProvider
    ImageProvider <|.. FluxImageProvider
    ImageProvider <|.. HuggingFaceImageProvider
```

### CLI Extension (Phase 5)

```
$ bookillust generate -i story.txt --text-provider claude --image-provider flux
```

### New Environment Variables (Phase 5)

```
ANTHROPIC_API_KEY=        # Claude API key (paid)
GROQ_API_KEY=             # Groq API key (free)
FAL_KEY=                  # fal.ai API key for FLUX.2
HF_TOKEN=                 # Hugging Face API token (free)
```

---

## Risk-Adjusted Timeline Estimate

| Phase | Optimistic | Realistic | Pessimistic |
|---|---|---|---|
| Phase 1: CLI MVP (OpenRouter) | 2 weeks | 4 weeks | 6 weeks |
| Phase 2: Static Hosting | 2 days | 4 days | 1 week |
| Phase 3: Telegram Bot | 1 week | 2 weeks | 3 weeks |
| Phase 4: Multi-format | 1 week | 2 weeks | 3 weeks |
| Phase 5: Provider Abstraction | 1 week | 2 weeks | 3 weeks |

Phase 1 is faster than the original estimate (was 3-5-8 weeks) because there's no provider abstraction to build. The main risk factor remains the consistency engine — achieving acceptable character consistency requires experimentation and prompt iteration.
