import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load environment variables before any other imports
// In production (Vercel), environment variables are injected directly
// In development, load from .env.local or .env files
if (process.env.NODE_ENV !== 'production') {
  const envLocalPath = join(process.cwd(), '.env.local');
  if (existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  }
  dotenv.config();
}

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  usePostgres: process.env.USE_POSTGRES === 'true',
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '20'),
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
};
