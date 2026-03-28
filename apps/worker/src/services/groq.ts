import Groq from 'groq-sdk';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Groq AI client singleton
 */
const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
});

/**
 * Call Groq LLaMA with retry logic
 * Parses JSON response and validates with provided schema
 */
export async function callGroq<T>(
  prompt: string,
  parseSchema: (data: unknown) => T,
  retries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.debug({ attempt, retries }, 'Calling Groq API');

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      });

      const content = completion.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in Groq response');
      }

      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ?? content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : content;

      const parsed = JSON.parse(jsonStr);

      // Validate with Zod schema
      return parseSchema(parsed);
    } catch (error) {
      logger.warn({ attempt, retries, error }, 'Groq API call failed');

      if (attempt === retries) {
        throw new Error(`Groq API failed after ${retries} attempts: ${error}`);
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }

  throw new Error('Unexpected: retry loop exited without result');
}
