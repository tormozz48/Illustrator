# Application Architecture — Illustrated Book Generator

> **Decision: Gemini-only MVP.** No provider abstraction layer. See [decisions.md](./decisions.md) for all ADRs.

## System Overview

```mermaid
graph TB
    subgraph CLI["CLI Interface (commander)"]
        CMD["$ bookillust generate<br/>--input book.txt<br/>--style watercolor"]
    end

    CMD --> ORCH["Orchestrator<br/>(Pipeline Runner)"]

    subgraph Gemini["Google Gemini 2.5 Flash<br/>(@google/generative-ai)"]
        direction LR
        TEXT["Text Analysis<br/>1M context"]
        IMAGE["Image Generation<br/>500/day free"]
        VISION["Vision Validation<br/>consistency check"]
    end

    ORCH --> Gemini

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
        RAW --> LLM1["Gemini: Analyze full text<br/>(structured output → zod)"]
        LLM1 --> BIBLE["Character Bible<br/>+ Style Guide"]
    end

    subgraph Stage3["Stage 3: Split"]
        RAW --> LLM2["Gemini: Split chapters<br/>(structured output → zod)"]
        LLM2 --> CHAPTERS["Chapter[]"]
    end

    subgraph Stage4["Stage 4: Illustrate (parallel via p-map)"]
        CHAPTERS --> PAR{{"p-map<br/>concurrency: 3"}}
        BIBLE --> PROMPT_BUILD["Build Prompt"]
        PAR --> LLM3["Gemini: Find key scene"]
        LLM3 --> PROMPT_BUILD
        PROMPT_BUILD --> IMG_GEN["Gemini Flash Image:<br/>Generate with anchor ref"]
        IMG_GEN --> VALIDATE["Gemini Vision:<br/>Validate consistency"]
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

## Gemini Integration (Direct, No Abstraction)

Since the MVP uses Gemini exclusively, there is no provider interface. The Gemini SDK is used directly in pipeline modules.

```mermaid
classDiagram
    class GeminiClient {
        -genAI: GoogleGenerativeAI
        -textModel: GenerativeModel
        -imageModel: GenerativeModel
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
        -gemini: GeminiClient
        -config: AppConfig
        +run(inputPath: string): Promise~BookResult~
    }

    class Assembler {
        +assemble(bible: CharacterBible, chapters: EnrichedChapter[]): string
    }

    Orchestrator --> GeminiClient
    Orchestrator --> Assembler
    GeminiClient --> ValidationResult
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
| AI (all operations) | Google Gemini 2.5 Flash | `@google/generative-ai` | Free. Text + image + vision in one SDK. |
| CLI Framework | commander | `commander` | Industry standard. 25M+ downloads/week. |
| CLI UX | ora + chalk | `ora`, `chalk` | Spinners & colored progress output. |
| Schema Validation | zod | `zod` | Gemini structured output integration. |
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
│   ├── gemini.ts                 # GeminiClient — all AI operations
│   ├── pipeline/
│   │   ├── orchestrator.ts       # Main pipeline runner
│   │   ├── reader.ts             # Read + normalize .txt files
│   │   ├── analyzer.ts           # Bible generation (uses gemini.ts)
│   │   ├── splitter.ts           # Chapter splitting (uses gemini.ts)
│   │   ├── illustrator.ts        # Scene → prompt → image → validate
│   │   └── assembler.ts          # Eta template → HTML bundle
│   ├── templates/
│   │   └── book.eta              # HTML book template
│   ├── schemas.ts                # Zod schemas for all data models
│   └── config.ts                 # Configuration & env vars
├── .env.example                  # Template for GEMINI_API_KEY
├── biome.json                    # Biome linter/formatter config
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

Key differences from the original multi-provider design:

- **No `providers/` directory** — Gemini is used directly via `gemini.ts`
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
    participant Gemini as GeminiClient
    participant Assembler

    User->>CLI: bookillust generate --input book.txt
    CLI->>Orch: run(config)

    Orch->>Gemini: analyzeBook(rawText) → CharacterBible
    Gemini-->>Orch: bible (characters, style, settings)

    Note over Orch: Generate anchor images for main characters
    loop Each main character
        Orch->>Gemini: generateImage(characterPrompt)
        Gemini-->>Orch: anchorImage
        Orch->>Gemini: validateImage(anchorImage, bible)
        Gemini-->>Orch: validation result
    end

    Orch->>Gemini: splitChapters(rawText)
    Gemini-->>Orch: chapters[]

    Note over Orch: Process chapters in parallel (p-map, concurrency: 3)
    par Chapter 1
        Orch->>Gemini: findKeyScene(ch1, bible)
        Gemini-->>Orch: scene1
        Orch->>Gemini: generateImage(prompt1, anchors)
        Gemini-->>Orch: image1
        Orch->>Gemini: validateImage(image1, bible)
        Gemini-->>Orch: score ≥ 0.7 → accept
    and Chapter 2
        Orch->>Gemini: findKeyScene(ch2, bible)
        Gemini-->>Orch: scene2
        Orch->>Gemini: generateImage(prompt2, anchors)
        Gemini-->>Orch: image2
        Orch->>Gemini: validateImage(image2, bible)
        Gemini-->>Orch: score < 0.7 → retry
    and Chapter N...
        Note over Orch,Gemini: same flow for each chapter
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
GEMINI_API_KEY=              # Google AI Studio API key (free, no credit card)

# Optional defaults
DEFAULT_STYLE=watercolor     # Art style preset
DEFAULT_CONCURRENCY=3        # Parallel chapter limit
```
