/**
 * Database Performance Monitor
 * Provides real-time monitoring and analysis of database performance
 */

import { db } from './connection';

export interface SlowQuery {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  maxTime: number;
  stddevTime: number;
  rows: number;
}

export interface MissingIndex {
  schemaname: string;
  tablename: string;
  attname: string;
  nDistinct: number;
  correlation: number;
}

export interface ConnectionPoolStats {
  activeConnections: number;
  maxConnections: number;
  idleConnections: number;
  waitingOnLock: number;
  utilizationPercent: number;
}

export interface TableBloat {
  schemaname: string;
  tablename: string;
  totalSize: string;
  tableSize: string;
  indexSize: string;
  bloatRatio?: number;
}

export interface IndexUsage {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexScans: number;
  indexSize: string;
  unused: boolean;
}

export interface CacheHitRatio {
  database: string;
  tableHitRatio: number;
  indexHitRatio: number;
  overallHitRatio: number;
}

export class DatabasePerformanceMonitor {
  /**
   * Analyze slow queries and suggest optimizations
   */
  async analyzeSlowQueries(thresholdMs: number = 100): Promise<SlowQuery[]> {
    try {
      // Check if pg_stat_statements extension is available
      const extensionExists = await db.oneOrNone(
        `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`
      );

      if (!extensionExists) {
        console.warn('pg_stat_statements extension not installed');
        return [];
      }

      const result = await db.manyOrNone<SlowQuery>(`
        SELECT
          query,
          calls,
          total_time,
          mean_time,
          max_time,
          stddev_time,
          rows
        FROM pg_stat_statements
        WHERE mean_time > $1
          AND query NOT LIKE '%pg_stat_statements%'
        ORDER BY mean_time DESC
        LIMIT 20
      `, [thresholdMs]);

      return result || [];
    } catch (error) {
      console.error('Failed to analyze slow queries:', error);
      return [];
    }
  }

  /**
   * Find tables that might benefit from additional indexes
   */
  async findMissingIndexes(): Promise<MissingIndex[]> {
    try {
      const result = await db.manyOrNone<MissingIndex>(`
        SELECT
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats
        WHERE schemaname = 'public'
          AND n_distinct > 100
          AND correlation < 0.1
          AND attname NOT IN (
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid
            WHERE a.attnum = ANY(i.indkey)
          )
        ORDER BY n_distinct DESC
        LIMIT 20
      `);

      return result || [];
    } catch (error) {
      console.error('Failed to find missing indexes:', error);
      return [];
    }
  }

  /**
   * Monitor connection pool health
   */
  async getConnectionPoolStats(): Promise<ConnectionPoolStats> {
    try {
      const result = await db.one(`
        SELECT
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state != 'idle') as active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock') as waiting_on_lock
      `);

      const utilizationPercent =
        (result.active_connections / result.max_connections) * 100;

      return {
        activeConnections: parseInt(result.active_connections),
        maxConnections: parseInt(result.max_connections),
        idleConnections: parseInt(result.idle_connections),
        waitingOnLock: parseInt(result.waiting_on_lock),
        utilizationPercent: Math.round(utilizationPercent)
      };
    } catch (error) {
      console.error('Failed to get connection pool stats:', error);
      throw error;
    }
  }

  /**
   * Check table bloat and recommend VACUUM
   */
  async checkTableBloat(): Promise<TableBloat[]> {
    try {
      const result = await db.manyOrNone<any>(`
        WITH table_bloat AS (
          SELECT
            schemaname,
            tablename,
            pg_total_relation_size(schemaname||'.'||tablename) as total_bytes,
            pg_relation_size(schemaname||'.'||tablename) as table_bytes,
            pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename) as index_bytes
          FROM pg_tables
          WHERE schemaname = 'public'
        )
        SELECT
          schemaname,
          tablename,
          pg_size_pretty(total_bytes) as total_size,
          pg_size_pretty(table_bytes) as table_size,
          pg_size_pretty(index_bytes) as index_size,
          CASE
            WHEN table_bytes > 0
            THEN ROUND((total_bytes::numeric / table_bytes::numeric), 2)
            ELSE 0
          END as bloat_ratio
        FROM table_bloat
        WHERE total_bytes > 1048576  -- Only tables larger than 1MB
        ORDER BY total_bytes DESC
      `);

      return result || [];
    } catch (error) {
      console.error('Failed to check table bloat:', error);
      return [];
    }
  }

  /**
   * Analyze index usage and find unused indexes
   */
  async analyzeIndexUsage(): Promise<IndexUsage[]> {
    try {
      const result = await db.manyOrNone<any>(`
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
          CASE WHEN idx_scan = 0 THEN true ELSE false END as unused
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
      `);

      return result || [];
    } catch (error) {
      console.error('Failed to analyze index usage:', error);
      return [];
    }
  }

  /**
   * Get cache hit ratios
   */
  async getCacheHitRatio(): Promise<CacheHitRatio> {
    try {
      const result = await db.one(`
        SELECT
          current_database() as database,
          ROUND(
            100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0),
            2
          ) as table_hit_ratio,
          ROUND(
            100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0),
            2
          ) as index_hit_ratio
        FROM pg_statio_user_tables
      `);

      const overallHitRatio =
        (parseFloat(result.table_hit_ratio || 0) + parseFloat(result.index_hit_ratio || 0)) / 2;

      return {
        database: result.database,
        tableHitRatio: parseFloat(result.table_hit_ratio || 0),
        indexHitRatio: parseFloat(result.index_hit_ratio || 0),
        overallHitRatio: Math.round(overallHitRatio * 100) / 100
      };
    } catch (error) {
      console.error('Failed to get cache hit ratio:', error);
      throw error;
    }
  }

  /**
   * Get long-running queries
   */
  async getLongRunningQueries(thresholdSeconds: number = 10): Promise<any[]> {
    try {
      const result = await db.manyOrNone(`
        SELECT
          pid,
          now() - query_start as duration,
          state,
          query,
          wait_event_type,
          wait_event
        FROM pg_stat_activity
        WHERE state != 'idle'
          AND now() - query_start > interval '$1 seconds'
          AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY duration DESC
      `, [thresholdSeconds]);

      return result || [];
    } catch (error) {
      console.error('Failed to get long-running queries:', error);
      return [];
    }
  }

  /**
   * Get table statistics for optimization
   */
  async getTableStatistics(tableName: string): Promise<any> {
    try {
      const result = await db.one(`
        SELECT
          schemaname,
          tablename,
          n_live_tup as live_rows,
          n_dead_tup as dead_rows,
          n_mod_since_analyze as modifications_since_analyze,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze,
          vacuum_count,
          autovacuum_count,
          analyze_count,
          autoanalyze_count
        FROM pg_stat_user_tables
        WHERE tablename = $1
      `, [tableName]);

      return result;
    } catch (error) {
      console.error(`Failed to get statistics for table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(): Promise<string> {
    const [
      poolStats,
      cacheRatio,
      slowQueries,
      longRunning,
      unusedIndexes,
      bloatedTables
    ] = await Promise.all([
      this.getConnectionPoolStats(),
      this.getCacheHitRatio(),
      this.analyzeSlowQueries(),
      this.getLongRunningQueries(),
      this.analyzeIndexUsage(),
      this.checkTableBloat()
    ]);

    const report = `
# Database Performance Report
Generated: ${new Date().toISOString()}

## Connection Pool
- Active Connections: ${poolStats.activeConnections}/${poolStats.maxConnections} (${poolStats.utilizationPercent}%)
- Idle Connections: ${poolStats.idleConnections}
- Waiting on Lock: ${poolStats.waitingOnLock}
${poolStats.utilizationPercent > 80 ? '⚠️ WARNING: High connection pool utilization' : '✅ Connection pool healthy'}

## Cache Hit Ratios
- Table Cache Hit: ${cacheRatio.tableHitRatio}%
- Index Cache Hit: ${cacheRatio.indexHitRatio}%
- Overall Cache Hit: ${cacheRatio.overallHitRatio}%
${cacheRatio.overallHitRatio < 90 ? '⚠️ WARNING: Low cache hit ratio' : '✅ Cache performance good'}

## Slow Queries (> 100ms)
${slowQueries.length === 0 ? 'No slow queries detected' :
  slowQueries.slice(0, 5).map(q =>
    `- Mean: ${Math.round(q.meanTime)}ms, Calls: ${q.calls}, Query: ${q.query.substring(0, 50)}...`
  ).join('\n')}

## Long Running Queries
${longRunning.length === 0 ? 'No long-running queries' :
  longRunning.map(q =>
    `- PID: ${q.pid}, Duration: ${q.duration}, State: ${q.state}`
  ).join('\n')}

## Unused Indexes
${unusedIndexes.filter(i => i.unused).length === 0 ? 'All indexes are being used' :
  unusedIndexes.filter(i => i.unused).slice(0, 5).map(i =>
    `- ${i.indexname} on ${i.tablename} (Size: ${i.indexSize})`
  ).join('\n')}

## Table Bloat
${bloatedTables.filter(t => t.bloatRatio && t.bloatRatio > 2).length === 0 ? 'No significant table bloat detected' :
  bloatedTables.filter(t => t.bloatRatio && t.bloatRatio > 2).map(t =>
    `- ${t.tablename}: ${t.totalSize} (Bloat ratio: ${t.bloatRatio}x)`
  ).join('\n')}

## Recommendations
${this.generateRecommendations(poolStats, cacheRatio, slowQueries, unusedIndexes, bloatedTables)}
    `.trim();

    return report;
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(
    poolStats: ConnectionPoolStats,
    cacheRatio: CacheHitRatio,
    slowQueries: SlowQuery[],
    unusedIndexes: IndexUsage[],
    bloatedTables: TableBloat[]
  ): string {
    const recommendations: string[] = [];

    if (poolStats.utilizationPercent > 80) {
      recommendations.push('- Increase max_connections or optimize connection pooling');
    }

    if (cacheRatio.overallHitRatio < 90) {
      recommendations.push('- Increase shared_buffers to improve cache performance');
    }

    if (slowQueries.length > 10) {
      recommendations.push('- Review and optimize slow queries with EXPLAIN ANALYZE');
    }

    if (unusedIndexes.filter(i => i.unused).length > 5) {
      recommendations.push('- Consider dropping unused indexes to improve write performance');
    }

    if (bloatedTables.some(t => t.bloatRatio && t.bloatRatio > 2)) {
      recommendations.push('- Run VACUUM FULL on bloated tables');
    }

    if (poolStats.waitingOnLock > 0) {
      recommendations.push('- Investigate lock contention issues');
    }

    return recommendations.length > 0
      ? recommendations.join('\n')
      : '- Database performance is optimal';
  }

  /**
   * Kill a long-running query
   */
  async killQuery(pid: number): Promise<boolean> {
    try {
      const result = await db.one(
        'SELECT pg_terminate_backend($1) as terminated',
        [pid]
      );
      return result.terminated;
    } catch (error) {
      console.error(`Failed to kill query with PID ${pid}:`, error);
      return false;
    }
  }

  /**
   * Run VACUUM on a specific table
   */
  async vacuumTable(tableName: string, full: boolean = false): Promise<void> {
    try {
      const vacuumType = full ? 'VACUUM FULL' : 'VACUUM';
      await db.none(`${vacuumType} ${tableName}`);
      console.log(`${vacuumType} completed for table ${tableName}`);
    } catch (error) {
      console.error(`Failed to vacuum table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Run ANALYZE on a specific table
   */
  async analyzeTable(tableName: string): Promise<void> {
    try {
      await db.none(`ANALYZE ${tableName}`);
      console.log(`ANALYZE completed for table ${tableName}`);
    } catch (error) {
      console.error(`Failed to analyze table ${tableName}:`, error);
      throw error;
    }
  }
}

// Singleton instance
export const perfMonitor = new DatabasePerformanceMonitor();