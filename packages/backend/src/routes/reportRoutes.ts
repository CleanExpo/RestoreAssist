import { Router, Request, Response } from 'express';
import { ClaudeService } from '../services/claudeService';
import { db } from '../services/databaseService';
import { GenerateReportRequest, GeneratedReport } from '../types';

export const reportRoutes = Router();
const claudeService = new ClaudeService();

// POST /api/reports - Create report (generate with AI)
reportRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const request: GenerateReportRequest = req.body;

    // Validation
    if (!request.propertyAddress || !request.damageType || !request.damageDescription || !request.state) {
      return res.status(400).json({
        error: 'Missing required fields: propertyAddress, damageType, damageDescription, state'
      });
    }

    const report = await claudeService.generateReport(request);
    db.create(report);

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
reportRoutes.get('/', (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const sortBy = (req.query.sortBy as 'timestamp' | 'totalCost') || 'timestamp';
    const order = (req.query.order as 'asc' | 'desc') || 'desc';

    const result = db.findAll({ page, limit, sortBy, order });

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
reportRoutes.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/reports/cleanup/old - Cleanup old reports
reportRoutes.delete('/cleanup/old', (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const deletedCount = db.deleteOlderThan(days);

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
reportRoutes.get('/:id', (req: Request, res: Response) => {
  try {
    const report = db.findById(req.params.id);

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
reportRoutes.patch('/:id', (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Don't allow updating reportId or timestamp
    delete updates.reportId;
    delete updates.timestamp;

    const updated = db.update(req.params.id, updates);

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
reportRoutes.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = db.delete(req.params.id);

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
