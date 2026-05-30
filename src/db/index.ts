import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = NeonHttpDatabase<Schema>;

export function createDb(url: string): Db {
  return drizzle(neon(url), { schema });
}

export { schema };
