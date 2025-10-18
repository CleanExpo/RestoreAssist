import pgPromise from 'pg-promise';
import { GeneratedReport } from '../types';

// Initialize pg-promise
const pgp = pgPromise({
  // Initialization options
  capSQL: true, // Generate capitalized SQL
});

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'restoreassist',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_SIZE || '20'), // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create database instance
export const db = pgp(dbConfig);

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

// Initialize database (run migrations)
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
      console.log('✅ Database initialized successfully');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
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
