# Character Consistency Strategy

> The hardest problem in the entire project. This document describes a multi-layered approach using multimodal AI via OpenRouter.
>
> **Decision: Validation enabled by default.** See [decisions.md](./decisions.md) ADR-002.

## The Problem

AI image generators produce each illustration independently. When generating page-by-page, the model naturally varies facial features, clothing, proportions, and color palette. A character with "curly red hair" in Chapter 1 might get straight auburn hair in Chapter 5.

Even with all techniques combined, expect **~80–90% visual consistency** on free-tier models. For professional-grade results, FLUX.2 with LoRA fine-tuning is the gold standard but requires paid compute.

---

## Consistency Layers

```mermaid
graph TB
    subgraph Layer1["Layer 1: Character & Style Bible"]
        BOOK["Full Book Text"] --> LLM_ANALYZE["LLM: Deep Analysis"]
        LLM_ANALYZE --> CHARS["Character Sheets<br/>(immutable visual descriptions)"]
        LLM_ANALYZE --> STYLE["Style Guide<br/>(locked art style prefix)"]
        LLM_ANALYZE --> SETTINGS["Setting Descriptions<br/>(recurring locations)"]
    end

    subgraph Layer2["Layer 2: Structured Prompt Templates"]
        CHARS --> TEMPLATE["Rigid Prompt Template"]
        STYLE --> TEMPLATE
        SETTINGS --> TEMPLATE
        TEMPLATE --> PROMPT["Final Prompt =<br/>stylePrefix + characterDesc +<br/>sceneDesc + composition +<br/>negativePrompt"]
    end

    subgraph Layer3["Layer 3: Anchor Images"]
        PROMPT --> ANCHOR_GEN["Generate Master Character Image<br/>(front-facing, neutral, clear)"]
        ANCHOR_GEN --> ANCHOR["Anchor Image<br/>(reference for all subsequent)"]
    end

    subgraph Layer4["Layer 4: Reference-Based Generation"]
        ANCHOR --> IMG_GEN["Image Generation<br/>(with reference image in context)"]
        PROMPT --> IMG_GEN
        IMG_GEN --> RESULT["Chapter Illustration"]
    end

    subgraph Layer5["Layer 5: Validation"]
        RESULT --> LLM_VALIDATE["LLM Vision: Compare<br/>illustration vs. bible"]
        LLM_VALIDATE -->|Pass| ACCEPT["Accept Image"]
        LLM_VALIDATE -->|Fail| REGENERATE["Regenerate with<br/>adjusted prompt"]
        REGENERATE --> IMG_GEN
    end
```

---

## Layer 1: Character & Style Bible

Before generating any images, the LLM analyzes the full book text and produces a structured "bible." This is the single source of truth for all visual descriptions.

### Character Sheet Schema

```typescript
interface CharacterSheet {
  name: string;
  age: string;                    // "mid-20s", "elderly", "child ~8 years"
  gender: string;
  build: string;                  // "slim", "stocky", "athletic"
  height: string;                 // "tall", "average", "short"
  skinTone: string;               // specific: "warm olive", "pale with freckles"
  hairColor: string;              // "dark auburn curly hair, shoulder-length"
  hairStyle: string;              // "tied in a loose braid"
  eyeColor: string;               // "bright green"
  facialFeatures: string;         // "sharp jawline, small nose, light freckles"
  clothing: string;               // "blue pinafore dress, brown leather boots"
  accessories: string[];          // ["silver pendant necklace", "worn leather satchel"]
  distinctiveFeatures: string[];  // ["scar on left cheek", "always carries a lantern"]
  role: string;                   // "protagonist", "mentor", "antagonist"
}
```

### Style Guide Schema

```typescript
interface StyleGuide {
  artStyle: string;        // "digital watercolor illustration"
  colorPalette: string;    // "warm earth tones with muted greens and golds"
  mood: string;            // "whimsical, slightly melancholic"
  lighting: string;        // "soft diffused natural light"
  lineWork: string;        // "clean outlines with soft edges"
  negativePrompt: string;  // "photorealistic, 3D render, anime, extra limbs..."
  stylePrefix: string;     // concatenated locked prefix for all prompts
}
```

### LLM Prompt for Bible Generation

The bible generation prompt instructs the LLM to:

1. Read the entire book text
2. Identify all named characters with speaking roles or physical descriptions
3. Infer visual details not explicitly stated (era-appropriate clothing, setting-consistent features)
4. Choose a single art style that fits the book's genre and tone
5. Output structured JSON matching the Zod schema

---

## Layer 2: Structured Prompt Templates

Every illustration prompt follows a rigid template. The key principle: **copy-paste, never retype.** Even small phrasing changes shift the output.

### Template Structure

```
{styleGuide.stylePrefix}.
{characterSheet.visualDescription}.
{sceneDescription}.
{composition and camera angle}.
{styleGuide.negativePrompt}
```

### Example Generated Prompt

```
Digital watercolor illustration, warm earth tones, soft diffused light,
clean outlines with soft edges.

A young woman in her mid-20s with dark auburn curly shoulder-length hair
tied in a loose braid, bright green eyes, pale skin with light freckles,
sharp jawline, small nose, wearing a blue pinafore dress and brown leather
boots, silver pendant necklace, carrying a worn leather satchel.

She stands at the edge of a dark pine forest at dusk, looking back over
her shoulder toward a small cottage with glowing windows in the distance.
Fallen leaves cover the ground. Mist curls between the tree trunks.

Medium shot, slight low angle, golden hour lighting from the left.

--no photorealistic, 3D render, anime, manga, color shift, changing
clothes, mutated proportions, different art style, extra limbs, bad
anatomy, blurry, low quality
```

---

## Layer 3: Anchor Images

```mermaid
flowchart LR
    subgraph AnchorGeneration["Anchor Generation (one-time)"]
        CHAR_DESC["Character Visual Description<br/>(from bible)"] --> ANCHOR_PROMPT["Prompt:<br/>Full-body portrait,<br/>front-facing, neutral pose,<br/>white background"]
        ANCHOR_PROMPT --> GENERATE["Generate Image"]
        GENERATE --> REVIEW["Manual or LLM review"]
        REVIEW -->|Good| SAVE["Save as anchor<br/>+ store seed"]
        REVIEW -->|Bad| GENERATE
    end

    subgraph Usage["Usage in Chapter Illustrations"]
        SAVE --> REF["Pass anchor as<br/>reference image"]
        REF --> CHAPTER_GEN["Generate chapter illustration<br/>with reference context"]
    end
```

For each main character:
1. Generate a "master" reference image: front-facing, neutral pose, clear lighting, white or simple background
2. Save the image buffer and the seed number (if the API returns one)
3. For all subsequent illustrations featuring that character, pass the anchor image as a reference input

With **OpenRouter's multimodal API**, you include the anchor image directly in the prompt context alongside the text prompt — the model "sees" the reference while generating.

---

## Layer 4: Seed Consistency

The image model does not currently expose seed control. However, OpenRouter's multimodal API allows passing anchor images directly in the prompt context — the model "sees" the reference alongside the text prompt, which serves a similar stabilizing purpose.

If provider abstraction is added in Phase 5, seed reuse can be enabled for FLUX.2 and Stable Diffusion APIs which do support it.

```typescript
// Pass anchor image in multimodal prompt via OpenRouter
const result = await client.generateImage(chapterPrompt, [anchorImage]);
// The model uses the anchor as visual context for consistency
```

---

## Layer 5: Post-processing Validation

**Enabled by default** (ADR-002). Uses vision capability via OpenRouter to evaluate generated illustrations against the character bible.

```mermaid
flowchart TD
    IMG["Generated Illustration"] --> VISION["LLM Vision Analysis"]
    BIBLE["Character Bible"] --> VISION
    VISION --> SCORE{"Consistency Score"}
    SCORE -->|≥ 0.7| ACCEPT["Accept"]
    SCORE -->|< 0.7| ADJUST["Adjust prompt:<br/>emphasize failed traits"]
    ADJUST --> REGEN["Regenerate (max 2 retries)"]
    REGEN --> VISION
```

### Validation Prompt

```
Compare this illustration against the character description below.
Score each trait 0-1 for visual match. Return JSON.

Character: {characterSheet}

Score these traits:
- hair_color_match
- hair_style_match
- clothing_match
- body_type_match
- distinctive_features_match
- art_style_match
- overall_consistency

If overall < 0.7, suggest specific prompt adjustments.
```

---

## Combining All Layers: Full Flow per Chapter

```mermaid
flowchart TD
    START["Chapter N text"] --> FIND_SCENE["LLM: Identify key scene<br/>(characters, setting, action, mood)"]
    FIND_SCENE --> BUILD_PROMPT["Build prompt from template:<br/>stylePrefix + character descs + scene"]
    BUILD_PROMPT --> CHECK_ANCHOR{"Anchor images<br/>exist for characters?"}

    CHECK_ANCHOR -->|Yes| GEN_WITH_REF["Generate with<br/>reference images + seed"]
    CHECK_ANCHOR -->|No| GEN_NO_REF["Generate from<br/>prompt only"]

    GEN_WITH_REF --> VALIDATE["LLM Vision: Validate<br/>consistency score"]
    GEN_NO_REF --> VALIDATE

    VALIDATE -->|Score ≥ 0.7| OPTIMIZE["jimp: resize 800px,<br/>compress JPEG 85%"]
    VALIDATE -->|Score < 0.7<br/>retry ≤ 2| ADJUST_PROMPT["Strengthen failed traits<br/>in prompt"]
    VALIDATE -->|Score < 0.7<br/>retry > 2| ACCEPT_BEST["Accept best attempt"]

    ADJUST_PROMPT --> GEN_WITH_REF
    ACCEPT_BEST --> OPTIMIZE
    OPTIMIZE --> EMBED["Embed base64 image<br/>into chapter at insertAfterParagraph"]
    EMBED --> DONE["Enriched Chapter"]
```

---

## Realistic Expectations

| Technique | Consistency Improvement | Cost | Complexity |
|---|---|---|---|
| Character bible + locked prompts | +40% baseline | Free | Low |
| OpenRouter multimodal anchor refs | +20% additional | Free | Medium |
| LLM validation + retry (default ON) | +5-10% additional | Free | Medium |
| **Combined MVP approach** | **~80-90%** | **Free** | **Medium** |
| LoRA fine-tuning (Phase 5: FLUX.2) | ~95-98% | Paid | High |

The OpenRouter-based approach delivers good results for storytelling purposes. Readers will recognize characters across chapters. For commercial-grade children's books or graphic novels, the FLUX.2 + LoRA path (Phase 5) is worth the investment.
