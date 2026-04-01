# Application Architecture — Illustrated Book Generator

> **Decision: OpenRouter-based MVP.** No provider abstraction layer. See [decisions.md](./decisions.md) for all ADRs.

## System Overview

```mermaid
graph TB
    subgraph CLI["CLI Interface (commander)"]
        CMD["$ bookillust generate<br/>--input book.txt<br/>--style watercolor"]
    end

    CMD --> ORCH["Orchestrator<br/>(Pipeline Runner)"]

    subgraph OpenRouter["OpenRouter API<br/>(@openrouter/sdk)"]
        direction LR
        TEXT["Text Analysis<br/>1M context"]
        IMAGE["Image Generation<br/>500/day free"]
        VISION["Vision Validation<br/>consistency check"]
    end

    ORCH --> OpenRouter

    subgraph Pipeline["Processing Pipeline"]
        direction TB
        P1["1. READ<br/>Parse input file"] --> P2["2. ANALYZE<br/>Build character &amp; style bible"]
        P2 --> P3["3. SPLIT<br/>Divide into chapters"]
        P3 --> P4["4. ILLUSTRATE<br/>Parallel: scene → prompt → image → validate"]
        P4 --> P5["5. ASSEMBLE<br/>Chapters + images → HTML bundle"]
    end

    ORCH --> Pipeline
    Pipeline --> OUTPUT["output/book.html<br/>(self-contained)"]
```

---

## Pipeline Detail

```mermaid
flowchart LR
    subgraph Stage1["Stage 1: Read"]
        INPUT["book.txt"] --> READER["BookReader<br/>(fs.readFile)"]
        READER --> RAW["Raw Text"]
    end

    subgraph Stage2["Stage 2: Analyze"]
        RAW --> LLM1["OpenRouter: Analyze full text<br/>(structured output → zod)"]
        LLM1 --> BIBLE["Character Bible<br/>+ Style Guide"]
    end

    subgraph Stage3["Stage 3: Split"]
        RAW --> LLM2["OpenRouter: Split chapters<br/>(structured output → zod)"]
        LLM2 --> CHAPTERS["Chapter[]"]
    end

    subgraph Stage4["Stage 4: Illustrate (parallel via p-map)"]
        CHAPTERS --> PAR{{"p-map<br/>concurrency: 3"}}
        BIBLE --> PROMPT_BUILD["Build Prompt"]
        PAR --> LLM3["OpenRouter: Find key scene"]
        LLM3 --> PROMPT_BUILD
        PROMPT_BUILD --> IMG_GEN["OpenRouter Image:<br/>Generate with anchor ref"]
        IMG_GEN --> VALIDATE["OpenRouter Vision:<br/>Validate consistency"]
        VALIDATE -->|Pass| OPTIMIZE["jimp: resize + compress"]
        VALIDATE -->|Fail, retry ≤ 2| PROMPT_BUILD
        OPTIMIZE --> ENRICHED["Enriched Chapter<br/>(text + base64 image)"]
    end

    subgraph Stage5["Stage 5: Assemble"]
        ENRICHED --> TEMPLATE["Eta Template Engine"]
        TEMPLATE --> BUNDLE["book.html<br/>with ToC + embedded images"]
    end
```

---

## OpenRouter Integration (Direct, No Abstraction)

Since the MVP uses OpenRouter exclusively, there is no provider interface. The OpenRouter SDK is used directly in pipeline modules.

```mermaid
classDiagram
    class OpenRouterClient {
        -client: OpenRouter
        +analyzeBook(text: string): Promise~CharacterBible~
        +splitChapters(text: string): Promise~Chapter[]~
        +findKeyScene(chapter: Chapter, bible: CharacterBible): Promise~KeyScene~
        +generateImage(prompt: string, refs?: Buffer[]): Promise~Buffer~
        +validateImage(image: Buffer, bible: CharacterBible): Promise~ValidationResult~
    }

    class ValidationResult {
        score: number
        traits: Record~string, number~
        suggestions?: string[]
        pass: boolean
    }

    class Orchestrator {
        -client: OpenRouterClient
        -config: AppConfig
        +run(inputPath: string): Promise~BookResult~
    }

    class Assembler {
        +assemble(bible: CharacterBible, chapters: EnrichedChapter[]): string
    }

    Orchestrator --> OpenRouterClient
    Orchestrator --> Assembler
    OpenRouterClient --> ValidationResult
```

---

## Data Models

```mermaid
classDiagram
    class CharacterBible {
        characters: CharacterSheet[]
        styleGuide: StyleGuide
        settings: Setting[]
    }

    class CharacterSheet {
        name: string
        visualDescription: string
        role: string
        distinctiveFeatures: string[]
        anchorImage?: Buffer
    }

    class StyleGuide {
        artStyle: string
        colorPalette: string
        mood: string
        negativePrompt: string
        stylePrefix: string
    }

    class Setting {
        name: string
        visualDescription: string
    }

    class Chapter {
        number: number
        title: string
        content: string
        keyScene: KeyScene
        illustration?: Illustration
    }

    class KeyScene {
        description: string
        characters: string[]
        setting: string
        mood: string
        insertAfterParagraph: number
    }

    class Illustration {
        imageBase64: string
        prompt: string
        width: number
        height: number
        validationScore: number
    }

    class BookResult {
        title: string
        author?: string
        bible: CharacterBible
        chapters: Chapter[]
        html: string
    }

    CharacterBible --> CharacterSheet
    CharacterBible --> StyleGuide
    CharacterBible --> Setting
    Chapter --> KeyScene
    Chapter --> Illustration
    BookResult --> CharacterBible
    BookResult --> Chapter
```

---

## Tech Stack

| Component | Technology | Package | Why |
|---|---|---|---|
| Language | TypeScript + Node.js | `typescript` | Requirement. Strong async/parallel. |
| AI (all operations) | OpenRouter (Gemini 2.5 Flash) | `@openrouter/sdk` | Unified API gateway. Text + image + vision via one SDK. |
| CLI Framework | commander | `commander` | Industry standard. 25M+ downloads/week. |
| CLI UX | ora + chalk | `ora`, `chalk` | Spinners & colored progress output. |
| Schema Validation | zod | `zod` | Structured output integration. |
| HTML Templating | Eta | `eta` | TypeScript-native, fastest engine. |
| Image Processing | jimp | `jimp` | Pure JS, zero native deps. |
| Concurrency | p-map | `p-map` | Map over chapters with concurrency limit. |
| Env Config | dotenv | `dotenv` | Load `.env` file. |
| Build | tsup | `tsup` | esbuild-powered, sub-100ms builds. |
| Dev Runner | tsx | `tsx` | Run `.ts` directly during development. |
| Linter / Formatter | Biome | `@biomejs/biome` | Already configured. 10-25x faster than ESLint. |
| Package Manager | npm | (built-in) | Ships with Node.js. Zero setup. |

---

## Project Structure

```
bookillust/
├── src/
│   ├── index.ts                  # CLI entry point (commander)
│   ├── openRouter.ts             # OpenRouterClient — all AI operations
│   ├── pipeline/
│   │   ├── orchestrator.ts       # Main pipeline runner
│   │   ├── reader.ts             # Read + normalize .txt files
│   │   ├── analyzer.ts           # Bible generation (uses openRouter.ts)
│   │   ├── splitter.ts           # Chapter splitting (uses openRouter.ts)
│   │   ├── illustrator.ts        # Scene → prompt → image → validate
│   │   └── assembler.ts          # Eta template → HTML bundle
│   ├── templates/
│   │   └── book.eta              # HTML book template
│   ├── schemas.ts                # Zod schemas for all data models
│   └── config.ts                 # Configuration & env vars
├── .env.example                  # Template for OPENROUTER_API_KEY
├── biome.json                    # Biome linter/formatter config
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

Key differences from the original multi-provider design:

- **No `providers/` directory** — OpenRouter is used directly via `openRouter.ts`
- **No interfaces** — no `TextAIProvider`, no `ImageProvider`. Direct SDK calls.
- **`schemas.ts`** — centralized Zod schemas (was `types.ts`)
- **`book.eta`** — Eta template (was `book.html.ejs`)
- **Simpler, flatter structure** — fewer files, fewer abstractions

---

## Sequence: Main Pipeline Execution

```mermaid
sequenceDiagram
    actor User
    participant CLI
    participant Orch as Orchestrator
    participant Client as OpenRouterClient
    participant Assembler

    User->>CLI: bookillust generate --input book.txt
    CLI->>Orch: run(config)

    Orch->>Client: analyzeBook(rawText) → CharacterBible
    Client-->>Orch: bible (characters, style, settings)

    Note over Orch: Generate anchor images for main characters
    loop Each main character
        Orch->>Client: generateImage(characterPrompt)
        Client-->>Orch: anchorImage
        Orch->>Client: validateImage(anchorImage, bible)
        Client-->>Orch: validation result
    end

    Orch->>Client: splitChapters(rawText)
    Client-->>Orch: chapters[]

    Note over Orch: Process chapters in parallel (p-map, concurrency: 3)
    par Chapter 1
        Orch->>Client: findKeyScene(ch1, bible)
        Client-->>Orch: scene1
        Orch->>Client: generateImage(prompt1, anchors)
        Client-->>Orch: image1
        Orch->>Client: validateImage(image1, bible)
        Client-->>Orch: score ≥ 0.7 → accept
    and Chapter 2
        Orch->>Client: findKeyScene(ch2, bible)
        Client-->>Orch: scene2
        Orch->>Client: generateImage(prompt2, anchors)
        Client-->>Orch: image2
        Orch->>Client: validateImage(image2, bible)
        Client-->>Orch: score < 0.7 → retry
    and Chapter N...
        Note over Orch,Client: same flow for each chapter
    end

    Orch->>Assembler: assemble(bible, enrichedChapters)
    Note over Assembler: Eta renders book.eta template
    Assembler-->>Orch: book.html (with base64 images)
    Orch-->>CLI: done → output/book.html
    CLI-->>User: Book generated: output/book.html
```

---

## CLI Interface Design

```
USAGE
  $ bookillust generate [OPTIONS]

OPTIONS
  -i, --input <path>        Path to input text file (required)
  -o, --output <path>       Output directory (default: ./output)
  -s, --style <style>       Art style: watercolor | comic | realistic | anime (default: watercolor)
  --concurrency <n>         Parallel chapter processing limit (default: 3)
  --no-cache                Disable caching of intermediate results
  --verbose                 Show detailed progress logs

EXAMPLES
  $ bookillust generate -i story.txt
  $ bookillust generate -i novel.txt -s comic
  $ bookillust generate -i book.txt -o ./my-book --concurrency 5
```

Note: `--text-provider` and `--image-provider` flags are removed from MVP. They will be added in Phase 5 when alternative providers are implemented.

---

## Configuration

```
# .env file — only one API key needed for MVP
OPENROUTER_API_KEY=          # OpenRouter API key — get one at openrouter.ai/settings/keys

# Optional defaults
DEFAULT_STYLE=watercolor     # Art style preset
DEFAULT_CONCURRENCY=3        # Parallel chapter limit
```
