/**
 * RestoreAssist Systems Audit API Endpoint
 * GET /api/admin/audit
 *
 * Provides authenticated access to system health audits
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import SystemsAuditRunner, {
  AuditResult,
  runQuickAudit,
  runCategoryAudit,
  RemediationTask
} from '@/.claude/systems-audit/systems-audit-implementation';

// Audit result cache (5 minutes)
let cachedResult: { timestamp: Date; result: AuditResult } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Admin role check
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') || 'full';
    const category = searchParams.get('category');
    const format = searchParams.get('format') || 'json';
    const useCache = searchParams.get('cache') !== 'false';

    // Check cache for full audits
    if (mode === 'full' && useCache && cachedResult) {
      const cacheAge = Date.now() - cachedResult.timestamp.getTime();
      if (cacheAge < CACHE_DURATION) {
        console.log('[Audit] Returning cached result');
        return formatResponse(cachedResult.result, format);
      }
    }

    console.log(`[Audit] Running ${mode} audit${category ? ` for category: ${category}` : ''}`);

    // Run appropriate audit
    let result: AuditResult;

    switch (mode) {
      case 'quick':
        result = await runQuickAudit();
        break;

      case 'category':
        if (!category) {
          return NextResponse.json(
            { error: 'Category parameter required for category mode' },
            { status: 400 }
          );
        }
        const validCategories = [
          'architecture',
          'backend',
          'frontend',
          'database',
          'security',
          'api',
          'compliance',
          'performance'
        ];
        if (!validCategories.includes(category)) {
          return NextResponse.json(
            { error: `Invalid category. Valid options: ${validCategories.join(', ')}` },
            { status: 400 }
          );
        }
        result = await runCategoryAudit(category);
        break;

      case 'full':
      default:
        const runner = new SystemsAuditRunner();
        result = await runner.runFullAudit();

        // Cache full audit results
        cachedResult = {
          timestamp: new Date(),
          result
        };
        break;
    }

    // Generate remediation tasks if requested
    if (searchParams.get('tasks') === 'true') {
      const runner = new SystemsAuditRunner();
      const tasks = runner.generateRemediationTasks(result);
      result['remediationTasks'] = tasks;
    }

    // Log audit completion
    logAuditEvent(session.user.email, mode, result.score.overall);

    // Return formatted response
    return formatResponse(result, format);

  } catch (error) {
    console.error('[Audit] Error running audit:', error);

    // Check if it's a database connection error
    if (error.message?.includes('P2002') || error.message?.includes('P2021')) {
      return NextResponse.json(
        {
          error: 'Database connection error',
          message: 'Unable to connect to database for audit checks',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        { status: 503 }
      );
    }

    // Generic error response
    return NextResponse.json(
      {
        error: 'Audit failed',
        message: 'An error occurred while running the system audit',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Format response based on requested format
function formatResponse(result: AuditResult, format: string): NextResponse {
  switch (format) {
    case 'summary':
      // Return simplified summary
      return NextResponse.json({
        timestamp: result.timestamp,
        score: result.score.overall,
        status: getHealthStatus(result.score.overall),
        categories: result.score.categories,
        issues: {
          critical: result.score.severity.critical,
          high: result.score.severity.high,
          medium: result.score.severity.medium,
          low: result.score.severity.low
        },
        summary: {
          totalChecks: result.summary.totalChecks,
          passed: result.summary.passed,
          failed: result.summary.failed,
          warnings: result.summary.warnings
        },
        criticalIssues: result.summary.criticalIssues
      });

    case 'metrics':
      // Return metrics for monitoring
      return NextResponse.json({
        health_score: result.score.overall,
        checks_total: result.summary.totalChecks,
        checks_passed: result.summary.passed,
        checks_failed: result.summary.failed,
        checks_warning: result.summary.warnings,
        issues_critical: result.score.severity.critical,
        issues_high: result.score.severity.high,
        issues_medium: result.score.severity.medium,
        issues_low: result.score.severity.low,
        timestamp: result.timestamp.getTime()
      });

    case 'html':
      // Return HTML report
      const html = generateHtmlReport(result);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      });

    case 'markdown':
      // Return markdown report
      const markdown = generateMarkdownReport(result);
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8'
        }
      });

    case 'json':
    default:
      // Return full JSON result
      return NextResponse.json(result);
  }
}

// Get health status from score
function getHealthStatus(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
}

// Log audit events for tracking
function logAuditEvent(userEmail: string, mode: string, score: number) {
  console.log(`[Audit Event] User: ${userEmail}, Mode: ${mode}, Score: ${score}`);

  // TODO: Implement actual logging to database or monitoring service
  // Example:
  // await prisma.auditLog.create({
  //   data: {
  //     userId: userEmail,
  //     action: 'SYSTEM_AUDIT',
  //     details: { mode, score },
  //     timestamp: new Date()
  //   }
  // });
}

// Generate HTML report
function generateHtmlReport(result: AuditResult): string {
  const status = getHealthStatus(result.score.overall);
  const statusColor =
    status === 'Excellent' ? '#10b981' :
    status === 'Good' ? '#3b82f6' :
    status === 'Fair' ? '#f59e0b' :
    status === 'Poor' ? '#ef4444' : '#dc2626';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RestoreAssist System Audit Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f7f7f7;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        h1 {
            margin: 0 0 10px 0;
            color: #1a1a1a;
        }
        .timestamp {
            color: #666;
            font-size: 14px;
        }
        .score-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            text-align: center;
        }
        .score-value {
            font-size: 72px;
            font-weight: bold;
            color: ${statusColor};
            margin: 20px 0;
        }
        .score-label {
            font-size: 24px;
            color: #666;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            background: ${statusColor};
            color: white;
            border-radius: 20px;
            font-weight: bold;
            margin-top: 10px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-card h3 {
            margin: 0 0 15px 0;
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
        }
        .category-scores {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .progress-bar {
            background: #e5e7eb;
            height: 24px;
            border-radius: 12px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ef4444, #f59e0b, #3b82f6, #10b981);
            transition: width 0.3s ease;
        }
        .critical-issues {
            background: #fef2f2;
            border: 1px solid #fecaca;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .critical-issues h2 {
            color: #dc2626;
            margin-top: 0;
        }
        .critical-issues ul {
            margin: 0;
            padding-left: 20px;
        }
        .recommendations {
            background: #f0f9ff;
            border: 1px solid #bfdbfe;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .recommendations h2 {
            color: #1e40af;
            margin-top: 0;
        }
        table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th {
            background: #f3f4f6;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #666;
        }
        td {
            padding: 12px;
            border-top: 1px solid #e5e7eb;
        }
        .status-pass { color: #10b981; }
        .status-fail { color: #ef4444; }
        .status-warning { color: #f59e0b; }
        .status-skip { color: #6b7280; }
        .severity-critical { color: #dc2626; font-weight: bold; }
        .severity-high { color: #ef4444; font-weight: bold; }
        .severity-medium { color: #f59e0b; }
        .severity-low { color: #6b7280; }
    </style>
</head>
<body>
    <div class="header">
        <h1>RestoreAssist System Audit Report</h1>
        <div class="timestamp">Generated: ${result.timestamp.toISOString()}</div>
    </div>

    <div class="score-card">
        <div class="score-label">Overall Health Score</div>
        <div class="score-value">${result.score.overall}</div>
        <div class="score-label">out of 100</div>
        <div class="status-badge">${status}</div>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Checks</h3>
            <div style="font-size: 32px; font-weight: bold;">${result.summary.totalChecks}</div>
        </div>
        <div class="summary-card">
            <h3>Passed</h3>
            <div style="font-size: 32px; font-weight: bold; color: #10b981;">${result.summary.passed}</div>
        </div>
        <div class="summary-card">
            <h3>Failed</h3>
            <div style="font-size: 32px; font-weight: bold; color: #ef4444;">${result.summary.failed}</div>
        </div>
        <div class="summary-card">
            <h3>Warnings</h3>
            <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${result.summary.warnings}</div>
        </div>
    </div>

    <div class="category-scores">
        <h2>Category Scores</h2>
        ${Object.entries(result.score.categories).map(([category, score]) => `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="text-transform: capitalize;">${category}</span>
                    <span>${score}/100</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${score}%;"></div>
                </div>
            </div>
        `).join('')}
    </div>

    ${result.summary.criticalIssues.length > 0 ? `
    <div class="critical-issues">
        <h2>⚠️ Critical Issues</h2>
        <ul>
            ${result.summary.criticalIssues.map(issue => `<li>${issue}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    ${result.summary.recommendations.length > 0 ? `
    <div class="recommendations">
        <h2>💡 Recommendations</h2>
        <ul>
            ${result.summary.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    <h2>Detailed Check Results</h2>
    <table>
        <thead>
            <tr>
                <th>Check ID</th>
                <th>Name</th>
                <th>Category</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Message</th>
            </tr>
        </thead>
        <tbody>
            ${result.checks.map(check => `
            <tr>
                <td>${check.id}</td>
                <td>${check.name}</td>
                <td style="text-transform: capitalize;">${check.category}</td>
                <td class="status-${check.status.toLowerCase()}">${check.status}</td>
                <td class="severity-${check.severity.toLowerCase()}">${check.severity}</td>
                <td>${check.message || '-'}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>`;
}

// Generate Markdown report
function generateMarkdownReport(result: AuditResult): string {
  let markdown = `# RestoreAssist System Audit Report\n\n`;
  markdown += `**Generated:** ${result.timestamp.toISOString()}\n\n`;

  // Health Score
  markdown += `## Overall Health Score: ${result.score.overall}/100\n\n`;
  markdown += `**Status:** ${getHealthStatus(result.score.overall)}\n\n`;

  // Category Scores
  markdown += `### Category Scores\n\n`;
  Object.entries(result.score.categories).forEach(([category, score]) => {
    markdown += `- **${category}:** ${score}/100\n`;
  });
  markdown += `\n`;

  // Summary Statistics
  markdown += `## Summary\n\n`;
  markdown += `- **Total Checks:** ${result.summary.totalChecks}\n`;
  markdown += `- **Passed:** ${result.summary.passed}\n`;
  markdown += `- **Failed:** ${result.summary.failed}\n`;
  markdown += `- **Warnings:** ${result.summary.warnings}\n`;
  markdown += `- **Skipped:** ${result.summary.skipped}\n\n`;

  // Issue Breakdown
  markdown += `## Issue Severity Breakdown\n\n`;
  markdown += `- **Critical Issues:** ${result.score.severity.critical}\n`;
  markdown += `- **High Priority:** ${result.score.severity.high}\n`;
  markdown += `- **Medium Priority:** ${result.score.severity.medium}\n`;
  markdown += `- **Low Priority:** ${result.score.severity.low}\n\n`;

  // Critical Issues
  if (result.summary.criticalIssues.length > 0) {
    markdown += `## ⚠️ Critical Issues\n\n`;
    result.summary.criticalIssues.forEach(issue => {
      markdown += `- ${issue}\n`;
    });
    markdown += `\n`;
  }

  // Recommendations
  if (result.summary.recommendations.length > 0) {
    markdown += `## 💡 Recommendations\n\n`;
    result.summary.recommendations.forEach(rec => {
      markdown += `- ${rec}\n`;
    });
    markdown += `\n`;
  }

  // Detailed Results by Category
  markdown += `## Detailed Results\n\n`;
  const categories = ['architecture', 'backend', 'frontend', 'database', 'security', 'api', 'compliance', 'performance'];

  categories.forEach(category => {
    const categoryChecks = result.checks.filter(c => c.category === category);
    if (categoryChecks.length > 0) {
      markdown += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;

      categoryChecks.forEach(check => {
        const statusIcon =
          check.status === 'PASS' ? '✅' :
          check.status === 'FAIL' ? '❌' :
          check.status === 'WARNING' ? '⚠️' : '⏭️';

        markdown += `#### ${statusIcon} ${check.id}: ${check.name}\n`;
        markdown += `- **Status:** ${check.status}\n`;
        markdown += `- **Severity:** ${check.severity}\n`;
        if (check.message) {
          markdown += `- **Message:** ${check.message}\n`;
        }
        if (check.remediation) {
          markdown += `- **Remediation:** ${check.remediation}\n`;
        }
        markdown += `\n`;
      });
    }
  });

  return markdown;
}

// Optional: POST endpoint for triggering audits with specific configurations
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      mode = 'full',
      category,
      exportReport = false,
      notifyOnFailure = false
    } = body;

    // Run audit
    const runner = new SystemsAuditRunner();
    let result: AuditResult;

    if (mode === 'category' && category) {
      result = await runCategoryAudit(category);
    } else if (mode === 'quick') {
      result = await runQuickAudit();
    } else {
      result = await runner.runFullAudit();
    }

    // Export reports if requested
    if (exportReport) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await runner.exportToMarkdown(result, `./audit-reports/audit-${timestamp}.md`);
      await runner.exportToJson(result, `./audit-reports/audit-${timestamp}.json`);
    }

    // Send notifications if health score is poor
    if (notifyOnFailure && result.score.overall < 60) {
      // TODO: Implement notification logic
      console.log('[Audit] Health score below threshold, notifications would be sent');
    }

    return NextResponse.json({
      success: true,
      result,
      exportedAt: exportReport ? new Date().toISOString() : null
    });

  } catch (error) {
    console.error('[Audit] Error in POST handler:', error);
    return NextResponse.json(
      {
        error: 'Audit failed',
        message: error.message
      },
      { status: 500 }
    );
  }
}