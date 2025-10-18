import { Router, Request, Response } from 'express';
import { ClaudeService } from '../services/claudeService';
import { db } from '../services/databaseService';
import { GenerateReportRequest, GeneratedReport } from '../types';
import { authenticate, authorize } from '../middleware/authMiddleware';

export const reportRoutes = Router();
const claudeService = new ClaudeService();

// POST /api/reports - Create report (generate with AI)
reportRoutes.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const request: GenerateReportRequest = req.body;

    // Validation
    if (!request.propertyAddress || !request.damageType || !request.damageDescription || !request.state) {
      return res.status(400).json({
        error: 'Missing required fields: propertyAddress, damageType, damageDescription, state'
      });
    }

    const report = await claudeService.generateReport(request);
    await db.createAsync(report);

    res.status(201).json(report);
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/reports - List reports (paginated)
reportRoutes.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const sortBy = (req.query.sortBy as 'timestamp' | 'totalCost') || 'timestamp';
    const order = (req.query.order as 'asc' | 'desc') || 'desc';

    const result = await db.findAllAsync({ page, limit, sortBy, order });

    res.json(result);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/reports/stats - Statistics
reportRoutes.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const stats = await db.getStatsAsync();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/reports/cleanup/old - Cleanup old reports (admin only)
reportRoutes.delete('/cleanup/old', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const deletedCount = await db.deleteOlderThanAsync(days);

    res.json({
      message: `Deleted ${deletedCount} reports older than ${days} days`,
      deletedCount,
      days
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({
      error: 'Failed to cleanup reports',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/reports/:id - Get single report
reportRoutes.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const report = await db.findByIdAsync(req.params.id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      error: 'Failed to fetch report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PATCH /api/reports/:id - Update report
reportRoutes.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Don't allow updating reportId or timestamp
    delete updates.reportId;
    delete updates.timestamp;

    const updated = await db.updateAsync(req.params.id, updates);

    if (!updated) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/reports/:id - Delete report
reportRoutes.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const deleted = await db.deleteAsync(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
