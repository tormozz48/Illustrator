import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export async function readBook(inputPath: string): Promise<string> {
  const absPath = resolve(inputPath);
  const raw = await readFile(absPath, 'utf-8');

  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTitle(text: string, filePath: string): string {
  const firstLine = (text.split('\n')[0] ?? '').trim();
  if (
    firstLine.length > 0 &&
    firstLine.length < 100 &&
    !firstLine.toLowerCase().startsWith('chapter') &&
    !firstLine.match(/^part\s+\d+/i)
  ) {
    return firstLine;
  }

  return basename(filePath)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
