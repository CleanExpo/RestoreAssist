/**
 * Integration Routes
 *
 * API endpoints for third-party integrations (ServiceM8, etc.)
 */

import { Router, Request, Response } from 'express';
import { servicem8Service } from '../services/integrations/servicem8Service';
import { googleDriveService } from '../services/integrations/googleDriveService';
import { db } from '../services/databaseService';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { SyncReportToJobRequest } from '../types/integrations';

export const integrationsRoutes = Router();

// All integration routes require authentication
integrationsRoutes.use(authenticate);

// ==========================================
// ServiceM8 Integration Endpoints
// ==========================================

/**
 * GET /api/integrations/servicem8/status
 * Check ServiceM8 integration status and test connection
 */
integrationsRoutes.get('/servicem8/status', async (req: Request, res: Response) => {
  try {
    const isEnabled = servicem8Service.isEnabled();

    if (!isEnabled) {
      return res.json({
        enabled: false,
        message: 'ServiceM8 integration not configured'
      });
    }

    const connectionTest = await servicem8Service.testConnection();

    res.json({
      enabled: true,
      connected: connectionTest.success,
      message: connectionTest.message
    });
  } catch (error) {
    console.error('Error checking ServiceM8 status:', error);
    res.status(500).json({
      error: 'Failed to check ServiceM8 status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/servicem8/jobs
 * Fetch jobs from ServiceM8
 */
integrationsRoutes.get('/servicem8/jobs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await servicem8Service.fetchJobs({
      page,
      limit,
      status,
      search
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching ServiceM8 jobs:', error);
    res.status(500).json({
      error: 'Failed to fetch ServiceM8 jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/servicem8/jobs/:jobId
 * Get a single ServiceM8 job by ID
 */
integrationsRoutes.get('/servicem8/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await servicem8Service.getJob(jobId);

    res.json(job);
  } catch (error) {
    console.error('Error fetching ServiceM8 job:', error);
    res.status(500).json({
      error: 'Failed to fetch ServiceM8 job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/integrations/servicem8/jobs
 * Create a new job in ServiceM8
 */
integrationsRoutes.post('/servicem8/jobs', async (req: Request, res: Response) => {
  try {
    const jobData = req.body;

    // Validation
    if (!jobData.job_address || !jobData.job_description) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'job_address and job_description are required'
      });
    }

    const newJob = await servicem8Service.createJob(jobData);

    res.status(201).json({
      message: 'Job created successfully',
      job: newJob
    });
  } catch (error) {
    console.error('Error creating ServiceM8 job:', error);
    res.status(500).json({
      error: 'Failed to create ServiceM8 job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/integrations/servicem8/jobs/:jobId
 * Update an existing ServiceM8 job
 */
integrationsRoutes.put('/servicem8/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const updates = req.body;

    const updatedJob = await servicem8Service.updateJob(jobId, updates);

    res.json({
      message: 'Job updated successfully',
      job: updatedJob
    });
  } catch (error) {
    console.error('Error updating ServiceM8 job:', error);
    res.status(500).json({
      error: 'Failed to update ServiceM8 job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/integrations/servicem8/jobs/:jobId/sync
 * Sync a RestoreAssist report to a ServiceM8 job
 */
integrationsRoutes.post('/servicem8/jobs/:jobId/sync', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { reportId, syncFields } = req.body;

    // Validation
    if (!reportId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'reportId is required'
      });
    }

    // Get the report
    const report = db.findById(reportId);
    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
        message: `No report found with ID: ${reportId}`
      });
    }

    // Sync report to job
    const syncRequest: SyncReportToJobRequest = {
      reportId,
      serviceM8JobId: jobId,
      syncFields
    };

    const result = await servicem8Service.syncReportToJob(report, syncRequest);

    if (result.success) {
      res.json({
        message: result.message,
        syncRecord: result.syncRecord,
        updatedJob: result.updatedJob
      });
    } else {
      res.status(500).json({
        error: 'Sync failed',
        message: result.message,
        syncRecord: result.syncRecord
      });
    }
  } catch (error) {
    console.error('Error syncing report to ServiceM8 job:', error);
    res.status(500).json({
      error: 'Failed to sync report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/servicem8/sync/:syncId
 * Get sync record by ID
 */
integrationsRoutes.get('/servicem8/sync/:syncId', (req: Request, res: Response) => {
  try {
    const { syncId } = req.params;
    const syncRecord = servicem8Service.getSyncRecord(syncId);

    if (!syncRecord) {
      return res.status(404).json({
        error: 'Sync record not found'
      });
    }

    res.json(syncRecord);
  } catch (error) {
    console.error('Error fetching sync record:', error);
    res.status(500).json({
      error: 'Failed to fetch sync record',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/servicem8/sync/report/:reportId
 * Get all sync records for a report
 */
integrationsRoutes.get('/servicem8/sync/report/:reportId', (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const syncRecords = servicem8Service.getSyncRecordsByReport(reportId);

    res.json({
      reportId,
      syncRecords,
      count: syncRecords.length
    });
  } catch (error) {
    console.error('Error fetching sync records:', error);
    res.status(500).json({
      error: 'Failed to fetch sync records',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/servicem8/stats
 * Get ServiceM8 integration statistics
 */
integrationsRoutes.get('/servicem8/stats', (req: Request, res: Response) => {
  try {
    const stats = servicem8Service.getStats();

    res.json(stats);
  } catch (error) {
    console.error('Error fetching integration stats:', error);
    res.status(500).json({
      error: 'Failed to fetch integration statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/integrations/servicem8/sync (admin only)
 * Clear all sync records (for testing/development)
 */
integrationsRoutes.delete('/servicem8/sync', authorize('admin'), (req: Request, res: Response) => {
  try {
    servicem8Service.clearSyncRecords();

    res.json({
      message: 'All sync records cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing sync records:', error);
    res.status(500).json({
      error: 'Failed to clear sync records',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==========================================
// Future Integration Endpoints
// ==========================================

/**
 * GET /api/integrations
 * List all available integrations and their status
 */
integrationsRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Check ServiceM8
    const servicem8Enabled = servicem8Service.isEnabled();
    let servicem8Connected = false;

    if (servicem8Enabled) {
      const connectionTest = await servicem8Service.testConnection();
      servicem8Connected = connectionTest.success;
    }

    // Check Google Drive
    const googleDriveEnabled = googleDriveService.isEnabled();
    const googleDriveAuthenticated = googleDriveEnabled && googleDriveService.isUserAuthenticated(userId);

    res.json({
      integrations: [
        {
          name: 'ServiceM8',
          id: 'servicem8',
          enabled: servicem8Enabled,
          connected: servicem8Connected,
          description: 'Field service management and CRM integration',
          requiresAuth: false
        },
        {
          name: 'Google Drive',
          id: 'google-drive',
          enabled: googleDriveEnabled,
          connected: googleDriveAuthenticated,
          description: 'Cloud storage for exported reports',
          requiresAuth: true
        }
        // Future integrations can be added here:
        // {
        //   name: 'Xero',
        //   id: 'xero',
        //   enabled: false,
        //   connected: false,
        //   description: 'Accounting software integration',
        //   requiresAuth: true
        // }
      ]
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({
      error: 'Failed to fetch integrations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
