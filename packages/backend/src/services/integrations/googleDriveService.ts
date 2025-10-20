/**
 * Google Drive Integration Service
 *
 * Provides integration with Google Drive for storing exported reports.
 * Handles OAuth 2.0 authentication, file uploads, folder management, and sharing.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import {
  GoogleDriveFile,
  GoogleDriveFolder,
  GoogleDriveUploadRequest,
  GoogleDriveUploadResponse,
  GoogleDriveAuthTokens,
  GoogleDriveUserAuth,
  DriveFileRecord,
  IntegrationStats
} from '../../types/integrations';

/**
 * Google Drive API Client
 *
 * Handles OAuth 2.0 flow and file operations with Google Drive
 */
class GoogleDriveService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private oauth2Client: OAuth2Client;
  private userAuths: Map<string, GoogleDriveUserAuth>;
  private driveFileRecords: Map<string, DriveFileRecord>;

  // OAuth scopes required
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/integrations/google-drive/callback';

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    this.userAuths = new Map();
    this.driveFileRecords = new Map();

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  Google Drive credentials not configured - Drive integration disabled');
    }
  }

  /**
   * Check if Google Drive integration is enabled
   */
  isEnabled(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Generate OAuth 2.0 authorisation URL
   */
  getAuthUrl(userId: string): string {
    if (!this.isEnabled()) {
      throw new Error('Google Drive integration not configured');
    }

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
      state: userId, // Pass userId in state to associate tokens with user
      prompt: 'consent' // Force consent to get refresh token
    });

    return authUrl;
  }

  /**
   * Exchange authorisation code for tokens
   */
  async handleAuthCallback(
    code: string,
    userId: string
  ): Promise<GoogleDriveUserAuth> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      // Get user email
      const oauth2 = google.oauth2({
        auth: this.oauth2Client,
        version: 'v2'
      });

      this.oauth2Client.setCredentials(tokens);
      const { data } = await oauth2.userinfo.get();

      const userAuth: GoogleDriveUserAuth = {
        userId,
        tokens: tokens as GoogleDriveAuthTokens,
        email: data.email || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.userAuths.set(userId, userAuth);

      console.log(`✅ Google Drive authorised for user ${userId} (${data.email})`);

      return userAuth;
    } catch (error) {
      console.error('Failed to handle OAuth callback:', error);
      throw error;
    }
  }

  /**
   * Get user authentication status
   */
  getUserAuth(userId: string): GoogleDriveUserAuth | undefined {
    return this.userAuths.get(userId);
  }

  /**
   * Check if user has authenticated with Google Drive
   */
  isUserAuthenticated(userId: string): boolean {
    const userAuth = this.userAuths.get(userId);
    if (!userAuth) return false;

    // Check if access token is expired
    const { tokens } = userAuth;
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      return false;
    }

    return true;
  }

  /**
   * Revoke user authorisation
   */
  async revokeUserAuth(userId: string): Promise<void> {
    const userAuth = this.userAuths.get(userId);
    if (!userAuth) {
      throw new Error('User not authenticated');
    }

    try {
      // Revoke token with Google
      this.oauth2Client.setCredentials(userAuth.tokens);
      await this.oauth2Client.revokeCredentials();

      // Remove from storage
      this.userAuths.delete(userId);

      console.log(`✅ Google Drive authorisation revoked for user ${userId}`);
    } catch (error) {
      console.error('Failed to revoke authorisation:', error);
      throw error;
    }
  }

  /**
   * Create Google Drive API client for user
   */
  private getDriveClient(userId: string) {
    const userAuth = this.userAuths.get(userId);
    if (!userAuth) {
      throw new Error('User not authenticated with Google Drive');
    }

    const auth = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    auth.setCredentials(userAuth.tokens);

    return google.drive({ version: 'v3', auth });
  }

  /**
   * Create folder in Google Drive
   */
  async createFolder(
    userId: string,
    folderName: string,
    parentFolderId?: string
  ): Promise<GoogleDriveFolder> {
    try {
      const drive = this.getDriveClient(userId);

      const fileMetadata: any = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };

      if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
      }

      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink, createdTime'
      });

      return response.data as GoogleDriveFolder;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  /**
   * Upload file to Google Drive
   */
  async uploadFile(
    userId: string,
    request: GoogleDriveUploadRequest
  ): Promise<GoogleDriveUploadResponse> {
    try {
      const drive = this.getDriveClient(userId);

      // Check if file exists
      if (!fs.existsSync(request.filePath)) {
        return {
          success: false,
          message: `File not found: ${request.filePath}`
        };
      }

      const fileMetadata: any = {
        name: request.fileName
      };

      if (request.folderId) {
        fileMetadata.parents = [request.folderId];
      }

      if (request.description) {
        fileMetadata.description = request.description;
      }

      const media = {
        mimeType: request.mimeType || 'application/octet-stream',
        body: fs.createReadStream(request.filePath)
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, mimeType, webViewLink, webContentLink, createdTime, modifiedTime, size, parents'
      });

      const file = response.data as GoogleDriveFile;

      console.log(`✅ Uploaded ${request.fileName} to Google Drive (${file.id})`);

      return {
        success: true,
        file,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      console.error('Failed to upload file:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Share file with user or make public
   */
  async shareFile(
    userId: string,
    fileId: string,
    options: {
      type: 'anyone' | 'domain' | 'user';
      role: 'reader' | 'writer' | 'commenter';
      emailAddress?: string;
    }
  ): Promise<void> {
    try {
      const drive = this.getDriveClient(userId);

      const permission: any = {
        type: options.type,
        role: options.role
      };

      if (options.type === 'user' && options.emailAddress) {
        permission.emailAddress = options.emailAddress;
      }

      await drive.permissions.create({
        fileId: fileId,
        requestBody: permission
      });

      console.log(`✅ File ${fileId} shared with ${options.type}`);
    } catch (error) {
      console.error('Failed to share file:', error);
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFile(userId: string, fileId: string): Promise<GoogleDriveFile> {
    try {
      const drive = this.getDriveClient(userId);

      const response = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, webViewLink, webContentLink, createdTime, modifiedTime, size, parents'
      });

      return response.data as GoogleDriveFile;
    } catch (error) {
      console.error('Failed to get file:', error);
      throw error;
    }
  }

  /**
   * Delete file from Google Drive
   */
  async deleteFile(userId: string, fileId: string): Promise<void> {
    try {
      const drive = this.getDriveClient(userId);

      await drive.files.delete({
        fileId: fileId
      });

      console.log(`✅ Deleted file ${fileId} from Google Drive`);
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * List files in folder
   */
  async listFiles(
    userId: string,
    options: {
      folderId?: string;
      pageSize?: number;
      pageToken?: string;
    } = {}
  ): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
    try {
      const drive = this.getDriveClient(userId);

      let query = "trashed = false";
      if (options.folderId) {
        query += ` and '${options.folderId}' in parents`;
      }

      const response = await drive.files.list({
        q: query,
        pageSize: options.pageSize || 10,
        pageToken: options.pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, createdTime, modifiedTime, size)'
      });

      return {
        files: (response.data.files || []) as GoogleDriveFile[],
        nextPageToken: response.data.nextPageToken || undefined
      };
    } catch (error) {
      console.error('Failed to list files:', error);
      throw error;
    }
  }

  /**
   * Save Drive file record
   */
  saveDriveFileRecord(record: DriveFileRecord): void {
    this.driveFileRecords.set(record.recordId, record);
  }

  /**
   * Get Drive file records for a report
   */
  getDriveFileRecordsByReport(reportId: string): DriveFileRecord[] {
    return Array.from(this.driveFileRecords.values())
      .filter(record => record.reportId === reportId)
      .sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
  }

  /**
   * Get all Drive file records for a user
   */
  getDriveFileRecordsByUser(userId: string): DriveFileRecord[] {
    return Array.from(this.driveFileRecords.values())
      .filter(record => record.uploadedBy === userId)
      .sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
  }

  /**
   * Get integration statistics
   */
  getStats(): IntegrationStats['googleDrive'] {
    const allRecords = Array.from(this.driveFileRecords.values());
    const lastRecord = allRecords.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    return {
      totalUploads: allRecords.length,
      successfulUploads: allRecords.length, // All saved records are successful
      failedUploads: 0, // Not tracking failures in records currently
      lastUploadAt: lastRecord?.uploadedAt,
      connectedUsers: this.userAuths.size
    };
  }

  /**
   * Clear all Drive file records (for testing/development)
   */
  clearDriveFileRecords(): void {
    this.driveFileRecords.clear();
  }

  /**
   * Clear all user authorizations (for testing/development)
   */
  clearUserAuths(): void {
    this.userAuths.clear();
  }
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService();
