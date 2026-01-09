import { Client } from '@microsoft/microsoft-graph-client';
import { prisma } from '@/lib/prisma';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

interface RefreshTokenResult {
  accessToken: string;
  expiresAt: Date;
}

export class MicrosoftGraphService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tenantId: string;

  constructor() {
    this.clientId = process.env.MICROSOFT_CLIENT_ID!;
    this.clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
    this.redirectUri = `${process.env.NEXTAUTH_URL}/api/email/microsoft/callback`;
    this.tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthUrl(): string {
    const scopes = encodeURIComponent('Mail.Send User.Read offline_access');
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?client_id=${this.clientId}&response_type=code&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scopes}&response_mode=query`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get tokens: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  /**
   * Refresh access token if expired or expiring soon (5-min buffer)
   */
  async refreshAccessToken(
    userId: string,
    refreshToken: string
  ): Promise<RefreshTokenResult> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    const data = await response.json();

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    const accessToken = data.access_token;

    await prisma.emailConnection.update({
      where: { userId },
      data: {
        accessToken,
        expiresAt,
      },
    });

    return { accessToken, expiresAt };
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const connection = await prisma.emailConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      throw new Error('Email connection not found');
    }

    const now = new Date();
    const bufferTime = 5 * 60 * 1000;
    const expiresWithBuffer = new Date(connection.expiresAt.getTime() - bufferTime);

    if (now >= expiresWithBuffer) {
      const { accessToken } = await this.refreshAccessToken(
        userId,
        connection.refreshToken
      );
      return accessToken;
    }

    return connection.accessToken;
  }

  /**
   * Get user's email address from Microsoft Graph
   */
  async getUserEmail(accessToken: string): Promise<string> {
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    const user = await client.api('/me').select('mail,userPrincipalName').get();
    return user.mail || user.userPrincipalName;
  }

  /**
   * Send email via Microsoft Graph API
   */
  async sendEmail(
    userId: string,
    params: SendEmailParams
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const accessToken = await this.getValidAccessToken(userId);

      const client = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const message: Record<string, unknown> = {
        subject: params.subject,
        body: {
          contentType: 'HTML',
          content: params.html,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.to,
            },
          },
        ],
      };

      if (params.attachments && params.attachments.length > 0) {
        message.attachments = params.attachments.map((att) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: att.filename,
          contentType: att.contentType,
          contentBytes: att.content.toString('base64'),
        }));
      }

      await client.api('/me/sendMail').post({
        message,
        saveToSentItems: true,
      });

      return {
        success: true,
        messageId: 'sent',
      };
    } catch (error) {
      console.error('Microsoft Graph send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
