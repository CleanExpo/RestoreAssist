import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EmailService } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    const scheduledEmails = await prisma.scheduledEmail.findMany({
      where: {
        status: 'pending',
        scheduledAt: {
          lte: now,
        },
      },
      include: {
        report: true,
        user: {
          include: {
            emailConnection: true,
          },
        },
      },
    });

    const results = [];

    for (const email of scheduledEmails) {
      try {
        if (!email.user.emailConnection) {
          await prisma.scheduledEmail.update({
            where: { id: email.id },
            data: {
              status: 'failed',
              error: 'No email connection found',
              lastAttempt: new Date(),
            },
          });
          results.push({
            id: email.id,
            status: 'failed',
            error: 'No email connection',
          });
          continue;
        }

        await prisma.scheduledEmail.update({
          where: { id: email.id },
          data: {
            status: 'sending',
            lastAttempt: new Date(),
            attempts: email.attempts + 1,
          },
        });

        const subject = `Report: ${email.report.title}`;
        const html = `
          <h1>${email.report.title}</h1>
          <p><strong>Client:</strong> ${email.report.clientName}</p>
          <p><strong>Property:</strong> ${email.report.propertyAddress}</p>
          <p><strong>Hazard Type:</strong> ${email.report.hazardType}</p>
          <p>Please find the attached report.</p>
        `;

        const emailService = new EmailService();
        const result = await emailService.sendEmail(
          email.userId,
          email.reportId,
          {
            to: email.recipient,
            subject,
            html,
          }
        );

        if (result.success) {
          await prisma.scheduledEmail.update({
            where: { id: email.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
            },
          });
          results.push({ id: email.id, status: 'sent' });
        } else {
          const retryDelay = email.attempts === 0 ? 1 : email.attempts === 1 ? 5 : 15;
          const nextRetry = new Date(now.getTime() + retryDelay * 60 * 1000);

          if (email.attempts >= 2) {
            await prisma.scheduledEmail.update({
              where: { id: email.id },
              data: {
                status: 'failed',
                error: result.error,
              },
            });
            results.push({
              id: email.id,
              status: 'failed',
              error: result.error,
            });
          } else {
            await prisma.scheduledEmail.update({
              where: { id: email.id },
              data: {
                status: 'pending',
                scheduledAt: nextRetry,
                error: result.error,
              },
            });
            results.push({
              id: email.id,
              status: 'retry',
              nextRetry: nextRetry.toISOString(),
            });
          }
        }
      } catch (error) {
        console.error(`Error processing scheduled email ${email.id}:`, error);
        await prisma.scheduledEmail.update({
          where: { id: email.id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        results.push({
          id: email.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Error in scheduled emails cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
