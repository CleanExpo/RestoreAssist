import { Router, Request, Response } from 'express';
import { db } from '../services/databaseService';
import { authenticate, authorise } from '../middleware/authMiddleware';

export const adminRoutes = Router();

// GET /api/admin/stats - Admin statistics (admin only)
adminRoutes.get('/stats', authenticate, authorise('admin'), async (req: Request, res: Response) => {
  try {
    // Check if PostgreSQL is enabled before accessing db
    const usePostgres = process.env.USE_POSTGRES === 'true';

    if (!usePostgres) {
      return res.status(503).json({
        error: 'Database not configured',
        message: 'PostgreSQL is not enabled. Set USE_POSTGRES=true to enable database features.'
      });
    }

    const stats = await db.getAdminStatsAsync();

    res.json({
      ...stats,
      uptime: `${Math.floor(stats.uptime / 1000 / 60)} minutes`,
      memoryUsage: {
        heapUsed: `${Math.round(stats.memoryUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(stats.memoryUsage.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(stats.memoryUsage.rss / 1024 / 1024)} MB`,
        external: `${Math.round(stats.memoryUsage.external / 1024 / 1024)} MB`
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      error: 'Failed to fetch admin statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/cleanup - Admin cleanup (admin only)
adminRoutes.post('/cleanup', authenticate, authorise('admin'), async (req: Request, res: Response) => {
  try {
    // Check if PostgreSQL is enabled before accessing db
    const usePostgres = process.env.USE_POSTGRES === 'true';

    if (!usePostgres) {
      return res.status(503).json({
        error: 'Database not configured',
        message: 'PostgreSQL is not enabled. Set USE_POSTGRES=true to enable database features.'
      });
    }

    const { days, clearAll } = req.body;

    if (clearAll === true) {
      const count = await db.countAsync();
      await db.clearAsync();
      return res.json({
        message: 'All reports cleared',
        deletedCount: count
      });
    }

    if (!days || isNaN(days)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Provide "days" (number) or "clearAll" (boolean)'
      });
    }

    const deletedCount = await db.deleteOlderThanAsync(days);

    res.json({
      message: `Deleted ${deletedCount} reports older than ${days} days`,
      deletedCount,
      days
    });
  } catch (error) {
    console.error('Error during admin cleanup:', error);
    res.status(500).json({
      error: 'Failed to cleanup',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/health - Health check with details
adminRoutes.get('/health', async (req: Request, res: Response) => {
  try {
    let adminStats;
    let reportStats;
    let databaseConnected = true;

    // Check if PostgreSQL is enabled before accessing db
    const usePostgres = process.env.USE_POSTGRES === 'true';

    if (usePostgres) {
      try {
        adminStats = await db.getAdminStatsAsync();
        reportStats = await db.getStatsAsync();
      } catch (dbError) {
        // Database unavailable, return degraded health
        databaseConnected = false;
        console.warn('Database connection failed in health check:', dbError);
      }
    } else {
      // PostgreSQL disabled, return degraded health
      databaseConnected = false;
    }

    const health = {
      status: databaseConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: databaseConnected,
        totalReports: adminStats?.totalReports || 0,
        size: adminStats?.databaseSize || 'unavailable'
      },
      system: {
        uptime: adminStats?.uptime || process.uptime(),
        memory: {
          heapUsed: adminStats?.memoryUsage?.heapUsed || process.memoryUsage().heapUsed,
          heapTotal: adminStats?.memoryUsage?.heapTotal || process.memoryUsage().heapTotal,
          rss: adminStats?.memoryUsage?.rss || process.memoryUsage().rss
        },
        nodeVersion: process.version,
        platform: process.platform
      },
      reports: reportStats ? {
        total: reportStats.totalReports,
        recent24h: reportStats.recentReports,
        totalValue: reportStats.totalValue,
        averageValue: reportStats.averageValue
      } : null
    };

    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
