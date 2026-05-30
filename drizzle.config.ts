import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load in Next.js priority order: .env.local wins for non-test envs.
config({ path: ['.env.local', '.env'] });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
