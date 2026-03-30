#!/usr/bin/env node
import { Command } from 'commander';
import { logger } from './logger.js';
import { run } from './pipeline/orchestrator.js';
import { AppConfigSchema } from './schemas.js';

const program = new Command();

program
  .name('bookillust')
  .description('Transform .txt books into AI-illustrated HTML using Google Gemini')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate an illustrated book from a text file')
  .requiredOption('-i, --input <path>', 'Path to input .txt file')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-s, --style <style>', 'Art style: watercolor | comic | realistic | anime', 'watercolor')
  .option('--concurrency <n>', 'Parallel chapter processing limit (1-10)', '3')
  .option('--no-cache', 'Disable caching of intermediate results')
  .option('--verbose', 'Show detailed progress logs')
  .action(
    async (opts: {
      input: string;
      output: string;
      style: string;
      concurrency: string;
      cache: boolean;
      verbose?: boolean;
    }) => {
      // Elevate to debug level when --verbose is passed so logger.debug() calls
      // become visible without changing the default log level.
      if (opts.verbose) {
        logger.level = 'debug';
      }

      const parseResult = AppConfigSchema.safeParse({
        inputPath: opts.input,
        outputDir: opts.output,
        style: opts.style,
        concurrency: Number(opts.concurrency),
        noCache: !opts.cache,
        verbose: opts.verbose ?? false,
      });

      if (!parseResult.success) {
        const errors = parseResult.error.issues
          .map((i) => `  ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        logger.error(`Invalid options:\n${errors}`);
        process.exit(1);
      }

      try {
        await run(parseResult.data);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err), {
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
        });
        process.exit(1);
      }
    }
  );

program.parse();
