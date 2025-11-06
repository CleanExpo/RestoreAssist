# RestoreAssist Systems Audit - Quick Start Guide

## Overview
The RestoreAssist Systems Audit Agent performs 70+ automated health checks across your entire SaaS platform, ensuring system integrity, security, performance, and IICRC compliance.

## Installation

### 1. Install Dependencies
```bash
# Add required dev dependencies if not already installed
npm install --save-dev @types/node
```

### 2. Copy Audit Files
The audit system files are located in `.claude/systems-audit/`:
- `systems-audit-agent-skill.md` - Complete documentation
- `systems-audit-implementation.ts` - Core implementation
- `systems-audit-api-endpoint.ts` - API endpoint
- `systems-audit-quick-start.md` - This guide

### 3. Set Up Environment Variables
Ensure all required environment variables are set:
```env
# Required for full audit functionality
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
```

## Integration into Project

### Option 1: Direct Script Execution
Create a script in your `package.json`:
```json
{
  "scripts": {
    "audit": "tsx .claude/systems-audit/run-audit.ts",
    "audit:quick": "tsx .claude/systems-audit/run-audit.ts --quick",
    "audit:category": "tsx .claude/systems-audit/run-audit.ts --category"
  }
}
```

Create `run-audit.ts`:
```typescript
import SystemsAuditRunner from './systems-audit-implementation';

async function main() {
  const runner = new SystemsAuditRunner();
  const result = await runner.runFullAudit();

  // Export report
  await runner.exportToMarkdown(result, './audit-report.md');
  await runner.exportToJson(result, './audit-report.json');

  // Display summary
  console.log(`\n🎯 Health Score: ${result.score.overall}/100`);
  console.log(`✅ Passed: ${result.summary.passed}`);
  console.log(`❌ Failed: ${result.summary.failed}`);
  console.log(`⚠️  Warnings: ${result.summary.warnings}`);

  // Exit with appropriate code
  process.exit(result.score.overall < 60 ? 1 : 0);
}

main().catch(console.error);
```

### Option 2: API Endpoint Integration
Copy the API endpoint to your app:
```bash
cp .claude/systems-audit/systems-audit-api-endpoint.ts app/api/admin/audit/route.ts
```

### Option 3: GitHub Actions Integration
Create `.github/workflows/system-audit.yml`:
```yaml
name: System Health Audit

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:      # Manual trigger
  pull_request:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run System Audit
        run: npm run audit
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Upload Audit Report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: audit-report
          path: |
            audit-report.md
            audit-report.json

      - name: Comment PR with Results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('audit-report.md', 'utf8');
            const summary = report.split('## Summary')[0];

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🔍 System Audit Results\n${summary}`
            });
```

### Option 4: Pre-commit Hook
Add to `.husky/pre-commit`:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run quick audit before commit
npm run audit:quick
```

## Running Audits

### Full System Audit
Runs all 70+ checks across all categories:
```bash
npm run audit
```

### Quick Audit
Runs only CRITICAL and HIGH severity checks:
```bash
npm run audit:quick
```

### Category-Specific Audit
Run checks for a specific category:
```bash
npm run audit:category architecture
npm run audit:category security
npm run audit:category database
```

### API Endpoint
Access via authenticated admin endpoint:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/audit
```

## Interpreting Results

### Health Score Ranges
- **90-100** (Excellent): System is production-ready
- **75-89** (Good): System is stable with minor issues
- **60-74** (Fair): Notable issues requiring attention
- **40-59** (Poor): Significant issues affecting reliability
- **0-39** (Critical): Severe issues requiring immediate action

### Understanding Check Results
Each check returns:
- **Status**: PASS, FAIL, WARNING, or SKIP
- **Severity**: CRITICAL, HIGH, MEDIUM, or LOW
- **Message**: Description of the finding
- **Remediation**: Suggested fix for the issue

### Report Formats

#### Markdown Report (`audit-report.md`)
Human-readable format with:
- Executive summary
- Health scores
- Critical issues list
- Detailed findings by category
- Remediation recommendations

#### JSON Report (`audit-report.json`)
Machine-readable format for:
- CI/CD integration
- Automated processing
- Historical tracking
- Custom dashboards

## Common Issues & Solutions

### Issue: Database Connection Errors
**Solution**: Ensure DATABASE_URL is correctly set and database is accessible.

### Issue: Missing Environment Variables
**Solution**: Create `.env.local` with all required variables:
```bash
cp .env.example .env.local
# Edit .env.local with your values
```

### Issue: Permission Errors
**Solution**: Ensure the audit runner has read access to all project files:
```bash
chmod +r -R .
```

### Issue: Prisma Schema Out of Sync
**Solution**: Run migrations before audit:
```bash
npx prisma migrate deploy
npm run audit
```

## Customization

### Adding New Checks
1. Edit `systems-audit-implementation.ts`
2. Add check to appropriate category method
3. Implement check logic
4. Update documentation

Example:
```typescript
private checkCustomFeature(): Partial<AuditCheck> {
  // Your validation logic
  if (someCondition) {
    return {
      status: CheckStatus.FAIL,
      message: 'Feature not configured',
      remediation: 'Configure feature in settings'
    };
  }
  return {
    status: CheckStatus.PASS,
    message: 'Feature properly configured'
  };
}
```

### Adjusting Severity Levels
Modify severity assignments in check definitions:
```typescript
this.addCheck({
  id: 'CUSTOM-001',
  name: 'Custom Check',
  category: 'custom',
  severity: Severity.HIGH,  // Change this
  ...this.checkCustomFeature()
});
```

### Excluding Checks
Set status to SKIP for checks not applicable:
```typescript
if (process.env.SKIP_PERFORMANCE_CHECKS) {
  return {
    status: CheckStatus.SKIP,
    message: 'Performance checks disabled'
  };
}
```

## Dashboard Integration

### Real-time Monitoring
Create a dashboard page at `app/dashboard/system-health/page.tsx`:
```typescript
import { useState, useEffect } from 'react';

export default function SystemHealthDashboard() {
  const [auditResult, setAuditResult] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit')
      .then(res => res.json())
      .then(setAuditResult);
  }, []);

  return (
    <div>
      <h1>System Health</h1>
      {auditResult && (
        <div>
          <h2>Score: {auditResult.score.overall}/100</h2>
          {/* Display results */}
        </div>
      )}
    </div>
  );
}
```

### Scheduled Audits
Use cron jobs or scheduled functions:
```typescript
// lib/scheduled-audit.ts
import { SystemsAuditRunner } from '.claude/systems-audit/systems-audit-implementation';

export async function scheduledAudit() {
  const runner = new SystemsAuditRunner();
  const result = await runner.runFullAudit();

  // Send alerts if score drops
  if (result.score.overall < 75) {
    await sendAlert('System health degraded', result);
  }

  // Store results
  await storeAuditResult(result);
}
```

## Best Practices

### 1. Regular Audits
- Run full audit weekly
- Quick audit on every deployment
- Category audits after related changes

### 2. CI/CD Integration
- Block deployments if score < 60
- Require audit pass for PR merges
- Track score trends over time

### 3. Team Collaboration
- Share audit reports in team channels
- Create tickets for HIGH/CRITICAL issues
- Review audit results in retrospectives

### 4. Progressive Enhancement
- Start with fixing CRITICAL issues
- Address HIGH priority next
- Schedule MEDIUM/LOW for sprints

### 5. Documentation
- Document custom checks
- Maintain remediation runbooks
- Track common issues and solutions

## Support & Troubleshooting

### Debug Mode
Enable verbose logging:
```bash
DEBUG=audit:* npm run audit
```

### Test Individual Checks
```typescript
const runner = new SystemsAuditRunner();
const result = runner.checkNextConfig();
console.log(result);
```

### Performance Profiling
```bash
time npm run audit
```

### Getting Help
1. Check the full documentation in `systems-audit-agent-skill.md`
2. Review implementation code in `systems-audit-implementation.ts`
3. Check for updates in `.claude/systems-audit/`

## Version History

### v1.0.0 (Current)
- Initial implementation
- 70+ automated checks
- 8 audit categories
- Multiple export formats
- API endpoint integration
- GitHub Actions support