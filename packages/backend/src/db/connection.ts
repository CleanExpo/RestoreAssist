import pgPromise from 'pg-promise';
import { GeneratedReport } from '../types';

// Initialise pg-promise
const pgp = pgPromise({
  // Initialisation options
  capSQL: true, // Generate capitalized SQL
});

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'restoreassist',
  user: process.env.DB_USER || 'restoreassist',
  password: process.env.DB_PASSWORD || 'dev_password_change_me',
  max: parseInt(process.env.DB_POOL_SIZE || '20'), // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds for serverless cold starts
};

// Lazy database connection - only create when actually used
let _db: pgPromise.IDatabase<any> | null = null;

export const db = new Proxy({} as pgPromise.IDatabase<any>, {
  get(target, prop) {
    // Only initialise database if USE_POSTGRES is enabled
    if (process.env.USE_POSTGRES !== 'true') {
      throw new Error('Database access attempted but USE_POSTGRES is not enabled');
    }

    // Lazy initialisation
    if (!_db) {
      console.log('🔌 Initializing database connection pool...');
      _db = pgp(dbConfig);
    }

    return (_db as any)[prop];
  }
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    await db.one('SELECT 1 as test');
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Initialise database (run migrations)
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('📋 Initializing database...');

    // Check if reports table exists
    const tableExists = await db.oneOrNone(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'reports'
      )`
    );

    if (!tableExists?.exists) {
      console.log('⚠️  Reports table does not exist');
      console.log('💡 Run migrations manually or set USE_POSTGRES=false to use in-memory storage');
    } else {
      console.log('✅ Database initialised successfully');
    }
  } catch (error) {
    console.error('❌ Database initialisation failed:', error);
    throw error;
  }
}

// Health check
export async function checkHealth(): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    await db.one('SELECT 1 as test');
    const latency = Date.now() - start;

    return {
      connected: true,
      latency,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get connection pool stats
export function getPoolStats() {
  return {
    config: {
      max: dbConfig.max,
      host: dbConfig.host,
      database: dbConfig.database,
    },
  };
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await pgp.end();
  console.log('🔌 Database connection closed');
}

// Export pgp instance for advanced usage
export { pgp };
