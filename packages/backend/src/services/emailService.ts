import nodemailer, { Transporter } from 'nodemailer';
import * as Sentry from '@sentry/node';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'resend';
  from: string;
  fromName: string;
  // SMTP settings
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  // API keys for other providers
  apiKey?: string;
}

/**
 * Interface for email service operations
 * Used for dependency injection and mocking in tests
 */
export interface IEmailService {
  sendCheckoutConfirmation(data: {
    email: string;
    customerName: string;
    planName: string;
    amount: number;
    currency: string;
    subscriptionId: string;
  }): Promise<boolean>;
  sendPaymentReceipt(data: {
    email: string;
    customerName: string;
    amount: number;
    currency: string;
    invoiceNumber: string;
    invoiceDate: string;
    planName: string;
  }): Promise<boolean>;
  sendSubscriptionCancelled(data: {
    email: string;
    customerName: string;
    planName: string;
    cancelledAt: string;
    accessUntil: string;
  }): Promise<boolean>;
  sendPaymentFailed(data: {
    email: string;
    customerName: string;
    amount: number;
    currency: string;
    retryDate: string;
    updatePaymentUrl: string;
  }): Promise<boolean>;
}

class EmailService implements IEmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private enabled: boolean = false;

  constructor() {
    this.config = {
      provider: (process.env.EMAIL_PROVIDER as any) || 'smtp',
      from: process.env.EMAIL_FROM || 'airestoreassist@gmail.com',
      fromName: process.env.EMAIL_FROM_NAME || 'RestoreAssist',
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
      apiKey: process.env.EMAIL_API_KEY,
    };

    this.initialize();
  }

  private initialize() {
    try {
      switch (this.config.provider) {
        case 'sendgrid':
          if (!this.config.apiKey) {
            console.warn('⚠️  SendGrid API key not configured');
            return;
          }
          this.transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            auth: {
              user: 'apikey',
              pass: this.config.apiKey,
            },
          });
          break;

        case 'resend':
          if (!this.config.apiKey) {
            console.warn('⚠️  Resend API key not configured');
            return;
          }
          this.transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
              user: 'resend',
              pass: this.config.apiKey,
            },
          });
          break;

        case 'smtp':
        default:
          if (!this.config.smtpHost || !this.config.smtpUser || !this.config.smtpPassword) {
            console.warn('⚠️  SMTP credentials not configured');
            console.warn('   Set EMAIL_PROVIDER, SMTP_HOST, SMTP_USER, SMTP_PASSWORD');
            return;
          }
          this.transporter = nodemailer.createTransport({
            host: this.config.smtpHost,
            port: this.config.smtpPort,
            secure: this.config.smtpPort === 465,
            auth: {
              user: this.config.smtpUser,
              pass: this.config.smtpPassword,
            },
          });
          break;
      }

      this.enabled = true;
      console.log(`✅ Email service initialized (provider: ${this.config.provider})`);
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      Sentry.captureException(error, {
        tags: {
          'email.provider': this.config.provider,
        },
      });
    }
  }

  /**
   * Check if email service is enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled && this.transporter !== null;
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      console.log(`📧 Email would be sent to: ${options.to}`);
      console.log(`   Subject: ${options.subject}`);
      console.log(`   (Email service not configured - set environment variables)`);
      return false;
    }

    try {
      const mailOptions = {
        from: `${this.config.fromName} <${this.config.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
        attachments: options.attachments,
      };

      Sentry.addBreadcrumb({
        category: 'email',
        message: `Sending email to ${options.to}`,
        level: 'info',
        data: {
          subject: options.subject,
          provider: this.config.provider,
        },
      });

      const info = await this.transporter!.sendMail(mailOptions);

      console.log(`✅ Email sent to ${options.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`Failed to send email to ${options.to}:`, error);

      Sentry.captureException(error, {
        tags: {
          'email.provider': this.config.provider,
          'email.to': options.to,
          'email.subject': options.subject,
        },
        level: 'error',
      });

      return false;
    }
  }

  /**
   * Send checkout confirmation email
   */
  async sendCheckoutConfirmation(data: {
    email: string;
    customerName: string;
    planName: string;
    amount: number;
    currency: string;
    subscriptionId: string;
  }): Promise<boolean> {
    const html = this.renderCheckoutConfirmation(data);

    return this.sendEmail({
      to: data.email,
      subject: `Welcome to RestoreAssist! Your ${data.planName} subscription is active`,
      html,
    });
  }

  /**
   * Send payment receipt email
   */
  async sendPaymentReceipt(data: {
    email: string;
    customerName: string;
    amount: number;
    currency: string;
    invoiceNumber: string;
    invoiceDate: string;
    planName: string;
  }): Promise<boolean> {
    const html = this.renderPaymentReceipt(data);

    return this.sendEmail({
      to: data.email,
      subject: `Payment Receipt - ${data.invoiceNumber}`,
      html,
    });
  }

  /**
   * Send subscription cancelled email
   */
  async sendSubscriptionCancelled(data: {
    email: string;
    customerName: string;
    planName: string;
    cancelledAt: string;
    accessUntil: string;
  }): Promise<boolean> {
    const html = this.renderSubscriptionCancelled(data);

    return this.sendEmail({
      to: data.email,
      subject: 'Your RestoreAssist subscription has been cancelled',
      html,
    });
  }

  /**
   * Send payment failed email
   */
  async sendPaymentFailed(data: {
    email: string;
    customerName: string;
    amount: number;
    currency: string;
    retryDate: string;
    updatePaymentUrl: string;
  }): Promise<boolean> {
    const html = this.renderPaymentFailed(data);

    return this.sendEmail({
      to: data.email,
      subject: 'Action Required: Payment Failed for RestoreAssist',
      html,
    });
  }

  /**
   * Simple HTML to text conversion
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Render checkout confirmation template
   */
  private renderCheckoutConfirmation(data: {
    customerName: string;
    planName: string;
    amount: number;
    currency: string;
    subscriptionId: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to RestoreAssist</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .details { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Welcome to RestoreAssist!</h1>
    <p>Your subscription is now active</p>
  </div>
  <div class="content">
    <p>Hi ${data.customerName},</p>
    <p>Thank you for subscribing to RestoreAssist! Your <strong>${data.planName}</strong> subscription is now active, and you have full access to all features.</p>

    <div class="details">
      <h3>Subscription Details</h3>
      <p><strong>Plan:</strong> ${data.planName}</p>
      <p><strong>Amount:</strong> ${data.currency.toUpperCase()} $${(data.amount / 100).toFixed(2)}</p>
      <p><strong>Subscription ID:</strong> ${data.subscriptionId}</p>
    </div>

    <p><strong>What's Next?</strong></p>
    <ul>
      <li>Start generating professional building inspection reports</li>
      <li>Use Claude AI for detailed damage assessments</li>
      <li>Export reports in PDF and DOCX formats</li>
      <li>Integrate with your CRM systems</li>
    </ul>

    <a href="https://restoreassist.com/dashboard" class="button">Go to Dashboard</a>

    <p>If you have any questions, our support team is here to help!</p>
  </div>
  <div class="footer">
    <p>RestoreAssist - Professional Building Inspection Reports</p>
    <p>Questions? Contact us at airestoreassist@gmail.com</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Render payment receipt template
   */
  private renderPaymentReceipt(data: {
    customerName: string;
    amount: number;
    currency: string;
    invoiceNumber: string;
    invoiceDate: string;
    planName: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #667eea; color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .invoice { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e5e7eb; }
    .amount { font-size: 32px; color: #667eea; font-weight: bold; text-align: center; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📧 Payment Receipt</h1>
  </div>
  <div class="content">
    <p>Hi ${data.customerName},</p>
    <p>Thank you for your payment! Here's your receipt for your RestoreAssist subscription.</p>

    <div class="invoice">
      <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
      <p><strong>Date:</strong> ${data.invoiceDate}</p>
      <p><strong>Plan:</strong> ${data.planName}</p>

      <div class="amount">
        ${data.currency.toUpperCase()} $${(data.amount / 100).toFixed(2)}
      </div>

      <p style="text-align: center; color: #10b981; font-weight: bold;">✓ Payment Successful</p>
    </div>

    <p>Your subscription will renew automatically on the next billing date. You can manage your subscription anytime from your dashboard.</p>
  </div>
  <div class="footer">
    <p>RestoreAssist - Professional Building Inspection Reports</p>
    <p>Questions? Contact us at airestoreassist@gmail.com</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Render subscription cancelled template
   */
  private renderSubscriptionCancelled(data: {
    customerName: string;
    planName: string;
    cancelledAt: string;
    accessUntil: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Cancelled</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6b7280; color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .details { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Subscription Cancelled</h1>
  </div>
  <div class="content">
    <p>Hi ${data.customerName},</p>
    <p>We're sorry to see you go! Your RestoreAssist <strong>${data.planName}</strong> subscription has been cancelled.</p>

    <div class="details">
      <p><strong>Cancelled on:</strong> ${data.cancelledAt}</p>
      <p><strong>Access until:</strong> ${data.accessUntil}</p>
    </div>

    <p>You'll continue to have full access to your account until <strong>${data.accessUntil}</strong>. After that date, you won't be billed again.</p>

    <p><strong>Changed your mind?</strong></p>
    <p>You can reactivate your subscription anytime from your dashboard before your access ends.</p>

    <a href="https://restoreassist.com/dashboard/subscription" class="button">Manage Subscription</a>

    <p>We'd love to hear your feedback about why you cancelled. Your input helps us improve!</p>
  </div>
  <div class="footer">
    <p>RestoreAssist - Professional Building Inspection Reports</p>
    <p>Questions? Contact us at airestoreassist@gmail.com</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Render payment failed template
   */
  private renderPaymentFailed(data: {
    customerName: string;
    amount: number;
    currency: string;
    retryDate: string;
    updatePaymentUrl: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed - Action Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚠️ Payment Failed</h1>
    <p>Action Required</p>
  </div>
  <div class="content">
    <p>Hi ${data.customerName},</p>
    <p>We were unable to process your payment for RestoreAssist. Your subscription is at risk of being cancelled.</p>

    <div class="alert">
      <p><strong>Failed Amount:</strong> ${data.currency.toUpperCase()} $${(data.amount / 100).toFixed(2)}</p>
      <p><strong>Next Retry:</strong> ${data.retryDate}</p>
    </div>

    <p><strong>What you need to do:</strong></p>
    <ol>
      <li>Update your payment method to avoid service interruption</li>
      <li>Ensure sufficient funds are available</li>
      <li>Check that your card details are correct</li>
    </ol>

    <a href="${data.updatePaymentUrl}" class="button">Update Payment Method</a>

    <p>If you don't update your payment method, we'll automatically retry on <strong>${data.retryDate}</strong>. After multiple failed attempts, your subscription may be cancelled.</p>

    <p>Need help? Our support team is ready to assist you.</p>
  </div>
  <div class="footer">
    <p>RestoreAssist - Professional Building Inspection Reports</p>
    <p>Questions? Contact us at airestoreassist@gmail.com</p>
  </div>
</body>
</html>
    `.trim();
  }
}

// Export singleton instance
export const emailService = new EmailService();
