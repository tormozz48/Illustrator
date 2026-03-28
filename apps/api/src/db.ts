import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@illustrator/shared/db';
import { env } from './env.js';

/**
 * Database client singleton
 */
const client = postgres(env.DATABASE_URL);

export const db = drizzle(client, { schema });
