#!/usr/bin/env node

/**
 * Database Optimization Script
 * Run periodic maintenance and optimization tasks
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

import { db } from '../db/connection';
import { perfMonitor } from '../db/performanceMonitor';
import { dbSeeder } from '../db/seed';

interface OptimizationOptions {
  analyze?: boolean;
  vacuum?: boolean;
  reindex?: boolean;
  report?: boolean;
  seed?: boolean;
  monitor?: boolean;
}

class DatabaseOptimizer {
  /**
   * Run all optimization tasks
   */
  async optimize(options: OptimizationOptions = {}): Promise<void> {
    const {
      analyze = true,
      vacuum = true,
      reindex = false,
      report = true,
      seed = false,
      monitor = true
    } = options;

    console.log('🔧 Starting database optimization...\n');

    try {
      // 1. Generate performance report
      if (report) {
        console.log('📊 Generating performance report...');
        const perfReport = await perfMonitor.generatePerformanceReport();
        console.log(perfReport);
        console.log('');
      }

      // 2. Check for slow queries
      if (monitor) {
        console.log('🐌 Checking for slow queries...');
        const slowQueries = await perfMonitor.analyzeSlowQueries(100);
        if (slowQueries.length > 0) {
          console.log(`Found ${slowQueries.length} slow queries:`);
          slowQueries.slice(0, 5).forEach(q => {
            console.log(`  - Mean: ${Math.round(q.meanTime)}ms, Calls: ${q.calls}`);
            console.log(`    Query: ${q.query.substring(0, 60)}...`);
          });
        } else {
          console.log('✅ No slow queries detected');
        }
        console.log('');
      }

      // 3. Analyze tables for statistics
      if (analyze) {
        console.log('📈 Updating table statistics...');
        const tables = await this.getTables();
        for (const table of tables) {
          await db.none(`ANALYZE ${table}`);
          console.log(`  ✓ Analyzed ${table}`);
        }
        console.log('');
      }

      // 4. Vacuum tables to reclaim space
      if (vacuum) {
        console.log('🧹 Vacuuming tables...');
        const tables = await this.getTables();
        for (const table of tables) {
          const stats = await this.getTableStats(table);
          if (stats.dead_rows > 1000 || stats.bloat_ratio > 1.2) {
            await db.none(`VACUUM ${table}`);
            console.log(`  ✓ Vacuumed ${table} (${stats.dead_rows} dead rows)`);
          } else {
            console.log(`  - Skipped ${table} (healthy)`);
          }
        }
        console.log('');
      }

      // 5. Reindex if requested (intensive operation)
      if (reindex) {
        console.log('🔄 Reindexing tables (this may take a while)...');
        const tables = await this.getTables();
        for (const table of tables) {
          await db.none(`REINDEX TABLE ${table}`);
          console.log(`  ✓ Reindexed ${table}`);
        }
        console.log('');
      }

      // 6. Check index usage
      console.log('📑 Analyzing index usage...');
      const indexUsage = await perfMonitor.analyzeIndexUsage();
      const unusedIndexes = indexUsage.filter(i => i.unused);
      if (unusedIndexes.length > 0) {
        console.log(`⚠️  Found ${unusedIndexes.length} unused indexes:`);
        unusedIndexes.forEach(idx => {
          console.log(`  - ${idx.indexname} on ${idx.tablename} (Size: ${idx.indexSize})`);
        });
      } else {
        console.log('✅ All indexes are being used');
      }
      console.log('');

      // 7. Check connection pool health
      console.log('🔌 Connection pool status:');
      const poolStats = await perfMonitor.getConnectionPoolStats();
      console.log(`  Active: ${poolStats.activeConnections}/${poolStats.maxConnections}`);
      console.log(`  Utilization: ${poolStats.utilizationPercent}%`);
      console.log(`  Waiting on locks: ${poolStats.waitingOnLock}`);
      console.log('');

      // 8. Check cache hit ratios
      console.log('💾 Cache performance:');
      const cacheRatio = await perfMonitor.getCacheHitRatio();
      console.log(`  Table cache hit: ${cacheRatio.tableHitRatio}%`);
      console.log(`  Index cache hit: ${cacheRatio.indexHitRatio}%`);
      console.log(`  Overall: ${cacheRatio.overallHitRatio}%`);

      if (cacheRatio.overallHitRatio < 90) {
        console.log('  ⚠️  Cache hit ratio is below optimal (90%)');
      }
      console.log('');

      // 9. Seed test data if requested
      if (seed) {
        console.log('🌱 Seeding test data...');
        await dbSeeder.seed({
          clearExisting: true,
          users: 10,
          reports: 50,
          organizations: 5,
          verbose: false
        });
        const counts = await dbSeeder.verify();
        console.log('  Created:');
        console.log(`    - ${counts.users} users`);
        console.log(`    - ${counts.organizations} organizations`);
        console.log(`    - ${counts.reports} reports`);
        console.log(`    - ${counts.subscriptions} subscriptions`);
        console.log(`    - ${counts.trials} trial tokens`);
        console.log('');
      }

      console.log('✅ Database optimization completed successfully!');

      // Summary recommendations
      this.printRecommendations(poolStats, cacheRatio, unusedIndexes);

    } catch (error) {
      console.error('❌ Optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get list of user tables
   */
  private async getTables(): Promise<string[]> {
    const result = await db.manyOrNone<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    return result.map(r => r.tablename);
  }

  /**
   * Get table statistics
   */
  private async getTableStats(tableName: string): Promise<any> {
    const stats = await db.oneOrNone(
      `SELECT
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        CASE
          WHEN n_live_tup > 0
          THEN ROUND((n_dead_tup::numeric / n_live_tup::numeric), 2)
          ELSE 0
        END as bloat_ratio
      FROM pg_stat_user_tables
      WHERE tablename = $1`,
      [tableName]
    );

    return stats || { live_rows: 0, dead_rows: 0, bloat_ratio: 0 };
  }

  /**
   * Print optimization recommendations
   */
  private printRecommendations(poolStats: any, cacheRatio: any, unusedIndexes: any[]): void {
    console.log('\n📋 RECOMMENDATIONS:');
    console.log('=' .repeat(50));

    const recommendations: string[] = [];

    if (poolStats.utilizationPercent > 80) {
      recommendations.push('• Increase connection pool size (currently at ' + poolStats.utilizationPercent + '%)');
    }

    if (cacheRatio.overallHitRatio < 90) {
      recommendations.push('• Increase shared_buffers to improve cache performance');
    }

    if (unusedIndexes.length > 5) {
      recommendations.push('• Consider dropping ' + unusedIndexes.length + ' unused indexes');
    }

    if (poolStats.waitingOnLock > 0) {
      recommendations.push('• Investigate lock contention (' + poolStats.waitingOnLock + ' waiting)');
    }

    if (recommendations.length === 0) {
      console.log('✅ No immediate actions required - database is healthy!');
    } else {
      recommendations.forEach(rec => console.log(rec));
    }

    console.log('=' .repeat(50));
  }

  /**
   * Run quick health check
   */
  async healthCheck(): Promise<void> {
    console.log('🏥 Running database health check...\n');

    try {
      // Test connection
      const connTest = await db.one('SELECT NOW() as current_time');
      console.log(`✅ Connection: OK (${connTest.current_time})`);

      // Check table count
      const tableCount = await db.one(
        `SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public'`
      );
      console.log(`✅ Tables: ${tableCount.count}`);

      // Check index count
      const indexCount = await db.one(
        `SELECT COUNT(*) as count FROM pg_indexes WHERE schemaname = 'public'`
      );
      console.log(`✅ Indexes: ${indexCount.count}`);

      // Check database size
      const dbSize = await db.one(
        `SELECT pg_size_pretty(pg_database_size(current_database())) as size`
      );
      console.log(`✅ Database size: ${dbSize.size}`);

      // Check for blocking queries
      const blocking = await db.manyOrNone(
        `SELECT pid, now() - query_start as duration, query
         FROM pg_stat_activity
         WHERE wait_event_type = 'Lock'
         LIMIT 5`
      );

      if (blocking.length > 0) {
        console.log(`⚠️  Found ${blocking.length} blocking queries`);
      } else {
        console.log('✅ No blocking queries');
      }

      console.log('\n✅ Database health check completed');
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const optimizer = new DatabaseOptimizer();
  const command = process.argv[2];

  switch (command) {
    case 'health':
      optimizer.healthCheck()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;

    case 'quick':
      optimizer.optimize({
        analyze: true,
        vacuum: true,
        reindex: false,
        report: false,
        seed: false
      })
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;

    case 'full':
      optimizer.optimize({
        analyze: true,
        vacuum: true,
        reindex: true,
        report: true,
        seed: false
      })
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;

    case 'seed':
      optimizer.optimize({
        analyze: false,
        vacuum: false,
        reindex: false,
        report: false,
        seed: true
      })
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;

    default:
      console.log('Database Optimization Tool\n');
      console.log('Usage:');
      console.log('  npm run db:optimize         - Run standard optimization');
      console.log('  npm run db:optimize health  - Quick health check');
      console.log('  npm run db:optimize quick   - Quick optimization (no reindex)');
      console.log('  npm run db:optimize full    - Full optimization (includes reindex)');
      console.log('  npm run db:optimize seed    - Seed test data');

      // Run default optimization
      optimizer.optimize()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
  }
}

export { DatabaseOptimizer };