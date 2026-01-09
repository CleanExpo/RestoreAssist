import { GoogleGmailService } from './google-gmail-service';
import { MicrosoftGraphService } from './microsoft-graph-service';
import { prisma } from '@/lib/prisma';
import { RateLimiter } from './rate-limiter';

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

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private googleService: GoogleGmailService;
  private microsoftService: MicrosoftGraphService;
  private rateLimiter: RateLimiter;

  constructor() {
    this.googleService = new GoogleGmailService();
    this.microsoftService = new MicrosoftGraphService();
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Get user's email connection
   */
  async getConnection(userId: string) {
    return await prisma.emailConnection.findUnique({
      where: { userId },
    });
  }

  /**
   * Check if user has email connection
   */
  async hasConnection(userId: string): Promise<boolean> {
    const connection = await this.getConnection(userId);
    return connection !== null;
  }

  /**
   * Send email using user's connected provider
   */
  async sendEmail(
    userId: string,
    reportId: string,
    params: SendEmailParams
  ): Promise<EmailResult> {
    const rateLimitCheck = await this.rateLimiter.checkLimit(userId);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. ${rateLimitCheck.remaining} emails remaining this hour.`,
      };
    }

    const connection = await this.getConnection(userId);
    if (!connection) {
      return {
        success: false,
        error: 'No email connection found. Please connect your email account.',
      };
    }

    let result: EmailResult;
    if (connection.provider === 'google') {
      result = await this.googleService.sendEmail(userId, params);
    } else if (connection.provider === 'microsoft') {
      result = await this.microsoftService.sendEmail(userId, params);
    } else {
      result = {
        success: false,
        error: `Unsupported email provider: ${connection.provider}`,
      };
    }

    await prisma.emailAudit.create({
      data: {
        userId,
        reportId,
        recipient: params.to,
        success: result.success,
        error: result.error,
        deliveryType: 'immediate',
      },
    });

    if (result.success) {
      await this.rateLimiter.incrementCount(userId);
    }

    return result;
  }

  /**
   * Disconnect email provider
   */
  async disconnect(userId: string): Promise<void> {
    await prisma.emailConnection.delete({
      where: { userId },
    });
  }
}
