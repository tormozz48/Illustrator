#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
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
        console.error(chalk.red(`\nInvalid options:\n${errors}\n`));
        process.exit(1);
      }

      try {
        await run(parseResult.data);
      } catch (err) {
        console.error(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        if (parseResult.data.verbose && err instanceof Error && err.stack) {
          console.error(chalk.dim(err.stack));
        }
        process.exit(1);
      }
    }
  );

program.parse();
