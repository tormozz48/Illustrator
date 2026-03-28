import { type PollinationsConfig, buildPollinationsUrl } from '@illustrator/shared/ai';
import { logger } from '../logger.js';

/**
 * Generate image using Pollinations API
 * @returns Image buffer
 */
export async function generateImage(
  sceneDescription: string,
  config: Partial<PollinationsConfig> = {}
): Promise<Buffer> {
  const fullConfig: PollinationsConfig = {
    prompt: sceneDescription,
    model: 'flux',
    width: 1024,
    height: 1024,
    nologo: true,
    enhance: false,
    ...config,
  };

  const url = buildPollinationsUrl(fullConfig);

  logger.debug({ url }, 'Generating image with Pollinations');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Pollinations API failed: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
