/**
 * Contact Form Routes
 * Handles contact form submissions with email notification
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import { pgp } from '../db/connection';
import crypto from 'crypto';

const router = express.Router();

// Email transporter configuration
const createEmailTransporter = () => {
  const config: any = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  };

  // Only create transporter if credentials are provided
  if (!config.auth.user || !config.auth.pass) {
    console.warn('⚠️ SMTP credentials not configured. Contact form emails will not be sent.');
    return null;
  }

  return nodemailer.createTransport(config);
};

// Database connection (optional - for storing submissions)
let db: Pool | null = null;

// Initialize database connection if enabled
const initDatabase = async () => {
  if (process.env.STORE_CONTACT_SUBMISSIONS === 'true' && process.env.USE_POSTGRES === 'true') {
    try {
      const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        database: process.env.DB_NAME || 'restoreassist',
        user: process.env.DB_USER || 'restoreassist',
        password: process.env.DB_PASSWORD || 'dev_password_change_me',
        max: 5, // Small pool for contact submissions
      };

      db = new Pool(dbConfig);

      // Create contact_submissions table if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS contact_submissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          subject VARCHAR(500) NOT NULL,
          category VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          ip_address VARCHAR(45),
          user_agent TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP,
          notes TEXT
        )
      `);

      // Create index for faster queries
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
        ON contact_submissions(created_at DESC)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_contact_submissions_email
        ON contact_submissions(email)
      `);

      console.log('✅ Contact submissions database initialized');
    } catch (error) {
      console.error('⚠️ Failed to initialize contact submissions database:', error);
      db = null;
    }
  }
};

// Initialize on module load
initDatabase().catch(console.error);

// Validation middleware
const validateContact = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2-100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name contains invalid characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('subject')
    .trim()
    .notEmpty().withMessage('Subject is required')
    .isLength({ min: 5, max: 200 }).withMessage('Subject must be between 5-200 characters')
    .escape(), // Escape HTML to prevent XSS

  body('category')
    .trim()
    .notEmpty().withMessage('Category is required')
    .isIn(['general', 'technical', 'billing', 'report', 'privacy'])
    .withMessage('Invalid category'),

  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ min: 10, max: 5000 }).withMessage('Message must be between 10-5000 characters')
    .escape(), // Escape HTML to prevent XSS
];

// Rate limiting helper (simple in-memory implementation)
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limit = 5; // 5 requests
  const window = 3600000; // per hour

  const record = rateLimiter.get(key);

  if (!record || record.resetTime < now) {
    rateLimiter.set(key, { count: 1, resetTime: now + window });
    return next();
  }

  if (record.count >= limit) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  }

  record.count++;
  next();
};

// Helper to generate ticket ID
const generateTicketId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `TICKET-${timestamp.toUpperCase()}-${random.toUpperCase()}`;
};

// Format email HTML
const formatEmailHtml = (data: any, ticketId: string) => {
  const categoryLabels: Record<string, string> = {
    general: 'General Inquiry',
    technical: 'Technical Support',
    billing: 'Billing & Subscriptions',
    report: 'Report Issue',
    privacy: 'Privacy & Security',
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background: #f5f5f5; padding: 20px; border: 1px solid #ddd; border-top: 0; }
        .field { margin-bottom: 15px; }
        .label { font-weight: bold; color: #555; }
        .value { margin-top: 5px; padding: 10px; background: white; border-radius: 3px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        .ticket-id { background: #FEF3C7; color: #92400E; padding: 10px; border-radius: 3px; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">New Contact Form Submission</h2>
        </div>
        <div class="content">
          <div class="ticket-id">
            <strong>Ticket ID:</strong> ${ticketId}
          </div>

          <div class="field">
            <div class="label">Name:</div>
            <div class="value">${data.name}</div>
          </div>

          <div class="field">
            <div class="label">Email:</div>
            <div class="value"><a href="mailto:${data.email}">${data.email}</a></div>
          </div>

          <div class="field">
            <div class="label">Category:</div>
            <div class="value">${categoryLabels[data.category] || data.category}</div>
          </div>

          <div class="field">
            <div class="label">Subject:</div>
            <div class="value">${data.subject}</div>
          </div>

          <div class="field">
            <div class="label">Message:</div>
            <div class="value">${data.message.replace(/\n/g, '<br>')}</div>
          </div>

          <div class="footer">
            <p>Submitted at: ${new Date().toLocaleString()}</p>
            <p>Please respond to this inquiry within 24 hours.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Format confirmation email for user
const formatUserConfirmationHtml = (data: any, ticketId: string) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 5px 5px 0 0; text-align: center; }
        .content { background: #f5f5f5; padding: 20px; border: 1px solid #ddd; border-top: 0; }
        .ticket-box { background: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; }
        .ticket-id { font-size: 20px; font-weight: bold; color: #92400E; }
        .message-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Thank You for Contacting RestoreAssist</h2>
        </div>
        <div class="content">
          <p>Hi ${data.name},</p>

          <p>We've received your message and will get back to you within 24 hours.</p>

          <div class="ticket-box">
            <p style="margin: 0;">Your ticket reference is:</p>
            <div class="ticket-id">${ticketId}</div>
            <p style="margin: 10px 0 0 0; font-size: 12px;">Please reference this ID in any follow-up communications</p>
          </div>

          <div class="message-box">
            <h3 style="margin-top: 0;">Your Message:</h3>
            <p><strong>Subject:</strong> ${data.subject}</p>
            <p>${data.message}</p>
          </div>

          <p>In the meantime, you might find these resources helpful:</p>
          <ul>
            <li><a href="https://restoreassist.app/docs">Documentation</a></li>
            <li><a href="https://restoreassist.app/faq">Frequently Asked Questions</a></li>
            <li><a href="https://restoreassist.app/support">Support Center</a></li>
          </ul>

          <div class="footer">
            <p>Best regards,<br>The RestoreAssist Team</p>
            <p style="font-size: 12px;">This is an automated response. Please do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * POST /api/contact
 * Submit a contact form
 */
router.post(
  '/',
  validateContact,
  checkRateLimit,
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { name, email, subject, category, message } = req.body;
      const ticketId = generateTicketId();

      // Store in database if configured
      if (db) {
        try {
          await db.query(
            `INSERT INTO contact_submissions
            (name, email, subject, category, message, ip_address, user_agent, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
            [
              name,
              email,
              subject,
              category,
              message,
              req.ip || req.socket.remoteAddress,
              req.headers['user-agent'],
            ]
          );
        } catch (dbError) {
          console.error('Failed to store contact submission in database:', dbError);
          // Continue even if database storage fails
        }
      }

      // Send email notifications
      const transporter = createEmailTransporter();

      if (transporter) {
        try {
          // Send to support team
          const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_USER;
          if (supportEmail) {
            await transporter.sendMail({
              from: `"RestoreAssist Contact Form" <${process.env.SMTP_USER}>`,
              to: supportEmail,
              subject: `[${ticketId}] ${subject}`,
              html: formatEmailHtml(req.body, ticketId),
              replyTo: email,
            });
          }

          // Send confirmation to user
          await transporter.sendMail({
            from: `"RestoreAssist Support" <${process.env.SMTP_USER}>`,
            to: email,
            subject: `We've received your message - ${ticketId}`,
            html: formatUserConfirmationHtml(req.body, ticketId),
          });

          console.log(`✅ Contact form submitted successfully: ${ticketId}`);
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
          // Still return success if email fails but submission is recorded
        }
      }

      // Return success response
      res.status(201).json({
        success: true,
        message: 'Your message has been received. We will respond within 24 hours.',
        ticketId,
        data: {
          name,
          email,
          subject,
          category,
        },
      });

    } catch (error) {
      console.error('Contact form submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit contact form. Please try again later.',
      });
    }
  }
);

/**
 * GET /api/contact/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  const emailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const dbConfigured = db !== null;

  res.json({
    success: true,
    status: 'operational',
    features: {
      email: emailConfigured,
      database: dbConfigured,
    },
    timestamp: new Date().toISOString(),
  });
});

// Cleanup on process termination
process.on('SIGTERM', async () => {
  if (db) {
    await db.end();
  }
});

export { router as contactRoutes };