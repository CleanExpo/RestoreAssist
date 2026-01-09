import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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

export class GoogleGmailService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/email/google/callback`
    );
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: new Date(tokens.expiry_date!),
    };
  }

  /**
   * Refresh access token if expired or expiring soon (5-min buffer)
   */
  async refreshAccessToken(
    userId: string,
    refreshToken: string
  ): Promise<RefreshTokenResult> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await this.oauth2Client.refreshAccessToken();

    const expiresAt = new Date(credentials.expiry_date!);
    const accessToken = credentials.access_token!;

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
   * Get user's email address from Google
   */
  async getUserEmail(accessToken: string): Promise<string> {
    this.oauth2Client.setCredentials({ access_token: accessToken });

    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();

    return data.email!;
  }

  /**
   * Send email via Gmail API
   */
  async sendEmail(
    userId: string,
    params: SendEmailParams
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      this.oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      const message = this.createMessage(params);

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
        },
      });

      return {
        success: true,
        messageId: result.data.id,
      };
    } catch (error) {
      console.error('Gmail send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create RFC 2822 formatted message
   */
  private createMessage(params: SendEmailParams): string {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    let message = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
    ];

    if (params.attachments && params.attachments.length > 0) {
      message.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      message.push('');
      message.push(`--${boundary}`);
      message.push('Content-Type: text/html; charset=UTF-8');
      message.push('');
      message.push(params.html);

      for (const attachment of params.attachments) {
        message.push('');
        message.push(`--${boundary}`);
        message.push(`Content-Type: ${attachment.contentType}`);
        message.push('Content-Transfer-Encoding: base64');
        message.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
        message.push('');
        message.push(attachment.content.toString('base64'));
      }

      message.push('');
      message.push(`--${boundary}--`);
    } else {
      message.push('Content-Type: text/html; charset=UTF-8');
      message.push('');
      message.push(params.html);
    }

    const email = message.join('\r\n');
    return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
