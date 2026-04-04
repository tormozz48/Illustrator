// ── Logger ─────────────────────────────────────────────────────────────────────
export { type Logger, pinoLogger, getLogger, setLogger } from './logger.js';

// ── AI client ──────────────────────────────────────────────────────────────────
export type { AIProvider } from './ai-provider.js';
export { GeminiClient } from './gemini.js';

// ── Schemas & types ────────────────────────────────────────────────────────────
export * from './schemas/index.js';

// ── Pipeline stages ────────────────────────────────────────────────────────────
export { buildBible } from './pipeline/analyzer.js';
export { splitIntoChapters } from './pipeline/splitter.js';
export {
  buildAnchorPrompt,
  buildImagePrompt,
  illustrateChapter,
  illustrateChapters,
  optimizeImage,
  type OptimizedImage,
} from './pipeline/illustrator.js';
export { assemble } from './pipeline/assembler.js';
export {
  assembleWebHtml,
  type WebAssembleOptions,
  type WebChapter,
} from './pipeline/assembler-web.js';

// ── Prompts ────────────────────────────────────────────────────────────────────
export { analyzeBookPrompt } from './prompts/analyzeBook.js';
export { findKeyScenePrompt, findKeySceneFallbackPrompt } from './prompts/findKeyScene.js';
export { splitChaptersPrompt } from './prompts/splitChapters.js';
export { validateImagePrompt } from './prompts/validateImage.js';

// ── Utilities ──────────────────────────────────────────────────────────────────
export { sanitizeLlmJson } from './utils/jsonRepair.js';
export { callWithJsonRetry, type LlmJsonCallOptions } from './utils/llmRetry.js';
export { sliceChapters } from './utils/sliceChapters.js';
export { estimateTruncationRisk } from './utils/truncationGuard.js';
