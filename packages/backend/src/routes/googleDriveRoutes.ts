/**
 * Google Drive Integration Routes
 *
 * API endpoints for Google Drive integration (OAuth, file uploads, etc.)
 */

import { Router, Request, Response } from 'express';
import { googleDriveService } from '../services/integrations/googleDriveService';
import { ExportService } from '../services/exportService';
import { db } from '../services/databaseService';
import { authenticate } from '../middleware/authMiddleware';
import {
  SaveToDriveRequest,
  GoogleDriveUploadRequest,
  DriveFileRecord
} from '../types/integrations';

const exportService = new ExportService();

export const googleDriveRoutes = Router();

// All Google Drive routes require authentication
googleDriveRoutes.use(authenticate);

// ==========================================
// OAuth 2.0 Authentication Endpoints
// ==========================================

/**
 * GET /api/integrations/google-drive/status
 * Check Google Drive integration status
 */
googleDriveRoutes.get('/status', (req: Request, res: Response) => {
  try {
    const enabled = googleDriveService.isEnabled();
    const userId = req.user!.userId;
    const isAuthenticated = enabled && googleDriveService.isUserAuthenticated(userId);
    const userAuth = googleDriveService.getUserAuth(userId);

    res.json({
      enabled,
      authenticated: isAuthenticated,
      email: userAuth?.email,
      connectedAt: userAuth?.createdAt
    });
  } catch (error) {
    console.error('Error checking Google Drive status:', error);
    res.status(500).json({
      error: 'Failed to check Google Drive status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/auth
 * Get OAuth 2.0 authorisation URL
 */
googleDriveRoutes.get('/auth', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const authUrl = googleDriveService.getAuthUrl(userId);

    res.json({
      authUrl,
      message: 'Redirect user to this URL to authorise Google Drive access'
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      error: 'Failed to generate authorisation URL',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/callback
 * OAuth 2.0 callback endpoint (redirect from Google)
 */
googleDriveRoutes.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        error: 'Missing authorisation code or state'
      });
    }

    const userId = state as string;
    const userAuth = await googleDriveService.handleAuthCallback(
      code as string,
      userId
    );

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/integrations?google_drive=success&email=${userAuth.email}`);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/integrations?google_drive=error`);
  }
});

/**
 * POST /api/integrations/google-drive/revoke
 * Revoke Google Drive authorisation
 */
googleDriveRoutes.post('/revoke', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    await googleDriveService.revokeUserAuth(userId);

    res.json({
      message: 'Google Drive authorisation revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking authorisation:', error);
    res.status(500).json({
      error: 'Failed to revoke authorisation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==========================================
// File Management Endpoints
// ==========================================

/**
 * POST /api/integrations/google-drive/folders
 * Create folder in Google Drive
 */
googleDriveRoutes.post('/folders', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { folderName, parentFolderId } = req.body;

    if (!folderName) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'folderName is required'
      });
    }

    const folder = await googleDriveService.createFolder(
      userId,
      folderName,
      parentFolderId
    );

    res.status(201).json({
      message: 'Folder created successfully',
      folder
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({
      error: 'Failed to create folder',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/files
 * List files in Google Drive
 */
googleDriveRoutes.get('/files', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const folderId = req.query.folderId as string | undefined;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const pageToken = req.query.pageToken as string | undefined;

    const result = await googleDriveService.listFiles(userId, {
      folderId,
      pageSize,
      pageToken
    });

    res.json(result);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      error: 'Failed to list files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/files/:fileId
 * Get file metadata
 */
googleDriveRoutes.get('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { fileId } = req.params;

    const file = await googleDriveService.getFile(userId, fileId);

    res.json(file);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({
      error: 'Failed to get file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/integrations/google-drive/files/:fileId
 * Delete file from Google Drive
 */
googleDriveRoutes.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { fileId } = req.params;

    await googleDriveService.deleteFile(userId, fileId);

    res.json({
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/integrations/google-drive/files/:fileId/share
 * Share file with user or make public
 */
googleDriveRoutes.post('/files/:fileId/share', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { fileId } = req.params;
    const { type, role, emailAddress } = req.body;

    if (!type || !role) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'type and role are required'
      });
    }

    await googleDriveService.shareFile(userId, fileId, {
      type,
      role,
      emailAddress
    });

    res.json({
      message: 'File shared successfully'
    });
  } catch (error) {
    console.error('Error sharing file:', error);
    res.status(500).json({
      error: 'Failed to share file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==========================================
// Report-Specific Endpoints
// ==========================================

/**
 * POST /api/integrations/google-drive/reports/:reportId/save
 * Save report to Google Drive (exports and uploads)
 */
googleDriveRoutes.post('/reports/:reportId/save', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { reportId } = req.params;
    const { format = 'pdf', folderId, share }: SaveToDriveRequest = req.body;

    // Get the report
    const report = db.findById(reportId);
    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
        message: `No report found with ID: ${reportId}`
      });
    }

    // Export the report
    const exportResult = await exportService.exportReport(report, {
      format,
      includeCharts: true,
      email: undefined
    });

    // Get the actual file path from exports directory
    const filePath = exportService.getExportedFile(exportResult.fileName);
    
    if (!filePath) {
      return res.status(500).json({
        error: 'Export failed',
        message: 'Could not locate exported file'
      });
    }

    // Upload to Google Drive
    const uploadRequest: GoogleDriveUploadRequest = {
      fileName: exportResult.fileName,
      filePath: filePath,
      folderId,
      mimeType: format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      description: `RestoreAssist Report - ${report.propertyAddress} - ${report.damageType}`
    };

    const uploadResult = await googleDriveService.uploadFile(userId, uploadRequest);

    if (!uploadResult.success || !uploadResult.file) {
      return res.status(500).json({
        error: 'Upload failed',
        message: uploadResult.message
      });
    }

    // Share file if requested
    if (share) {
      await googleDriveService.shareFile(userId, uploadResult.file.id, share);
    }

    // Save Drive file record
    const driveFileRecord: DriveFileRecord = {
      recordId: `drive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      reportId,
      driveFileId: uploadResult.file.id,
      fileName: uploadResult.file.name,
      fileUrl: uploadResult.file.webViewLink,
      format,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId
    };

    googleDriveService.saveDriveFileRecord(driveFileRecord);

    res.json({
      success: true,
      file: uploadResult.file,
      exportResult: {
        fileName: exportResult.fileName,
        downloadUrl: exportResult.downloadUrl,
        fileSize: exportResult.fileSize
      },
      message: 'Report saved to Google Drive successfully'
    });
  } catch (error) {
    console.error('Error saving report to Drive:', error);
    res.status(500).json({
      error: 'Failed to save report to Drive',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/reports/:reportId/files
 * Get all Drive files for a report
 */
googleDriveRoutes.get('/reports/:reportId/files', (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;

    const driveFiles = googleDriveService.getDriveFileRecordsByReport(reportId);

    res.json({
      reportId,
      files: driveFiles,
      count: driveFiles.length
    });
  } catch (error) {
    console.error('Error getting Drive files for report:', error);
    res.status(500).json({
      error: 'Failed to get Drive files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/my-files
 * Get all Drive files uploaded by current user
 */
googleDriveRoutes.get('/my-files', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const driveFiles = googleDriveService.getDriveFileRecordsByUser(userId);

    res.json({
      files: driveFiles,
      count: driveFiles.length
    });
  } catch (error) {
    console.error('Error getting user Drive files:', error);
    res.status(500).json({
      error: 'Failed to get Drive files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/integrations/google-drive/stats
 * Get Google Drive integration statistics
 */
googleDriveRoutes.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = googleDriveService.getStats();

    res.json(stats);
  } catch (error) {
    console.error('Error getting Drive stats:', error);
    res.status(500).json({
      error: 'Failed to get Drive statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==========================================
// Backup Operations (NEW)
// ==========================================

/**
 * POST /api/organizations/:orgId/google-drive/backup/all
 * Backup all reports for organisation
 */
googleDriveRoutes.post('/backup/all/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const userId = req.user!.userId;

    // TODO: Implement backupAllReports in googleDriveService
    const syncJobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.status(202).json({
      syncJobId,
      startTime: new Date(),
      estimatedTime: 300000, // 5 minutes estimate
      totalReports: 0, // TODO: Get actual count
      message: 'Backup job started'
    });
  } catch (error) {
    console.error('Error starting backup:', error);
    res.status(500).json({
      error: 'Failed to start backup',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/organizations/:orgId/google-drive/backup/status/:syncJobId
 * Get sync job progress
 */
googleDriveRoutes.get('/backup/status/:orgId/:syncJobId', (req: Request, res: Response) => {
  try {
    const { syncJobId } = req.params;

    // TODO: Implement job status tracking
    res.json({
      jobId: syncJobId,
      status: 'running',
      processed: 0,
      total: 0,
      failed: 0,
      progress: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      startedAt: new Date()
    });
  } catch (error) {
    console.error('Error getting backup status:', error);
    res.status(500).json({
      error: 'Failed to get backup status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/organizations/:orgId/google-drive/backup/cancel/:syncJobId
 * Cancel running backup job
 */
googleDriveRoutes.post('/backup/cancel/:orgId/:syncJobId', (req: Request, res: Response) => {
  try {
    const { syncJobId } = req.params;

    // TODO: Implement job cancellation
    res.json({
      success: true,
      processed: 0,
      message: 'Backup job cancelled'
    });
  } catch (error) {
    console.error('Error cancelling backup:', error);
    res.status(500).json({
      error: 'Failed to cancel backup',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/organizations/:orgId/google-drive/backup/logs
 * Get sync logs with filtering
 */
googleDriveRoutes.get('/backup/logs/:orgId', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    // TODO: Implement log retrieval from database
    res.json({
      logs: [],
      total: 0,
      hasMore: false
    });
  } catch (error) {
    console.error('Error getting sync logs:', error);
    res.status(500).json({
      error: 'Failed to get sync logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/organizations/:orgId/google-drive/backup/schedule
 * Create automatic backup schedule
 */
googleDriveRoutes.post('/backup/schedule/:orgId', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { frequency } = req.body;

    if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({
        error: 'Invalid frequency',
        message: 'Frequency must be daily, weekly, or monthly'
      });
    }

    // TODO: Implement schedule creation
    const scheduleId = `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1); // Tomorrow

    res.status(201).json({
      scheduleId,
      frequency,
      nextRun,
      message: 'Backup schedule created'
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({
      error: 'Failed to create schedule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/organizations/:orgId/google-drive/backup/statistics
 * Get backup statistics
 */
googleDriveRoutes.get('/backup/statistics/:orgId', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    // TODO: Calculate actual statistics from database
    res.json({
      totalBackups: 0,
      totalSize: 0,
      lastBackup: null,
      averageBackupSize: 0,
      backupFrequency: 'none',
      successRate: 0,
      lastWeekBackups: 0,
      lastMonthBackups: 0
    });
  } catch (error) {
    console.error('Error getting backup statistics:', error);
    res.status(500).json({
      error: 'Failed to get backup statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
