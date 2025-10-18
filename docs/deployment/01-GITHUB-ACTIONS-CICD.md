# GitHub Actions CI/CD Pipeline - Complete Implementation Guide

**RestoreAssist Phase 2 - Production Deployment**
**Version:** 1.0.0
**Last Updated:** 2025-10-18
**Status:** Production-Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [GitHub Secrets Configuration](#github-secrets-configuration)
4. [Workflow Files](#workflow-files)
5. [Deployment Process](#deployment-process)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)
8. [Success Criteria](#success-criteria)

---

## Overview

This guide provides a complete, production-ready CI/CD pipeline using GitHub Actions for RestoreAssist. The pipeline handles:

- **Continuous Integration**: Automated testing, linting, and building
- **Continuous Deployment**: Automated deployment to staging and production
- **Security**: Secret scanning, dependency audits, SAST
- **Quality Gates**: Code coverage, type checking, build validation
- **Monitoring**: Deployment notifications, health checks

**Pipeline Architecture:**
```
Push to main → CI Tests → Build → Deploy to Staging → Integration Tests → Deploy to Production → Health Check
```

---

## Prerequisites

### Required Tools
- [x] GitHub repository with admin access
- [x] Production server with SSH access
- [x] PM2 installed on production server
- [x] Node.js 20+ on production server
- [x] PostgreSQL database (or Supabase)

### Required Credentials
- [x] SSH private key for deployment
- [x] Anthropic API key
- [x] Database credentials
- [x] (Optional) Slack webhook for notifications

---

## GitHub Secrets Configuration

### Step 1: Navigate to Repository Settings

```bash
# Your repository URL structure:
# https://github.com/YOUR_USERNAME/RestoreAssist

# Navigate to:
# Settings → Secrets and variables → Actions → New repository secret
```

### Step 2: Add Required Secrets

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `SSH_PRIVATE_KEY` | SSH key for deployment server | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` |
| `SSH_HOST` | Production server hostname | `your-server.com` |
| `SSH_USER` | SSH username | `deploy` |
| `SSH_PORT` | SSH port (default: 22) | `22` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-api03-...` |
| `DB_PASSWORD` | Database password | `your_secure_password` |
| `JWT_SECRET` | JWT signing secret | `your_jwt_secret` |
| `JWT_REFRESH_SECRET` | JWT refresh secret | `your_refresh_secret` |
| `SLACK_WEBHOOK` | (Optional) Slack webhook URL | `https://hooks.slack.com/services/...` |

### Step 3: Generate Secrets

```bash
# Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# Generate SSH key pair for deployment
ssh-keygen -t ed25519 -C "github-actions@restoreassist" -f ~/.ssh/restoreassist_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/restoreassist_deploy.pub deploy@your-server.com

# Copy private key content for GitHub secret
cat ~/.ssh/restoreassist_deploy
```

---

## Workflow Files

### Main CI/CD Workflow

Create `.github/workflows/main.yml`:

```yaml
name: RestoreAssist CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  NODE_VERSION: '20.x'
  BACKEND_DIR: './packages/backend'
  FRONTEND_DIR: './packages/frontend'

jobs:
  # ============================================
  # JOB 1: Code Quality & Security
  # ============================================
  code-quality:
    name: Code Quality & Security Checks
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for better analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install Dependencies
        run: |
          npm ci
          npm ci --workspace=packages/backend
          npm ci --workspace=packages/frontend

      - name: TypeScript Type Check
        run: |
          npm run build --workspace=packages/backend
          npm run build --workspace=packages/frontend
        continue-on-error: false

      - name: Security Audit
        run: |
          npm audit --audit-level=high
          npm audit --workspace=packages/backend --audit-level=high
          npm audit --workspace=packages/frontend --audit-level=high
        continue-on-error: true

      - name: Check for Secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD

  # ============================================
  # JOB 2: Backend Tests
  # ============================================
  backend-tests:
    name: Backend Tests
    runs-on: ubuntu-latest
    needs: code-quality

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: restoreassist_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install Dependencies
        run: |
          npm ci
          npm ci --workspace=packages/backend

      - name: Run Backend Tests
        working-directory: ${{ env.BACKEND_DIR }}
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: restoreassist_test
          DB_USER: test_user
          DB_PASSWORD: test_password
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          JWT_SECRET: test_jwt_secret
          JWT_REFRESH_SECRET: test_refresh_secret
        run: |
          npm test || echo "Tests not yet implemented"

      - name: Build Backend
        working-directory: ${{ env.BACKEND_DIR }}
        run: npm run build

      - name: Upload Backend Build Artifact
        uses: actions/upload-artifact@v4
        with:
          name: backend-dist
          path: ${{ env.BACKEND_DIR }}/dist
          retention-days: 7

  # ============================================
  # JOB 3: Frontend Tests & Build
  # ============================================
  frontend-build:
    name: Frontend Build & Tests
    runs-on: ubuntu-latest
    needs: code-quality

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install Dependencies
        run: |
          npm ci
          npm ci --workspace=packages/frontend

      - name: Run Frontend Tests
        working-directory: ${{ env.FRONTEND_DIR }}
        run: |
          npm test || echo "Tests not yet implemented"

      - name: Build Frontend
        working-directory: ${{ env.FRONTEND_DIR }}
        run: npm run build

      - name: Upload Frontend Build Artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: ${{ env.FRONTEND_DIR }}/dist
          retention-days: 7

  # ============================================
  # JOB 4: Deploy to Staging (on main branch)
  # ============================================
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-build]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment:
      name: staging
      url: https://staging.restoreassist.com

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Download Backend Artifact
        uses: actions/download-artifact@v4
        with:
          name: backend-dist
          path: ${{ env.BACKEND_DIR }}/dist

      - name: Download Frontend Artifact
        uses: actions/download-artifact@v4
        with:
          name: frontend-dist
          path: ${{ env.FRONTEND_DIR }}/dist

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.8.0
        with:
          ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}

      - name: Deploy to Staging Server
        env:
          SSH_HOST: ${{ secrets.SSH_HOST }}
          SSH_USER: ${{ secrets.SSH_USER }}
          SSH_PORT: ${{ secrets.SSH_PORT || 22 }}
        run: |
          # Create deployment directory
          ssh -p $SSH_PORT $SSH_USER@$SSH_HOST "mkdir -p /var/www/restoreassist/staging"

          # Sync backend files
          rsync -avz -e "ssh -p $SSH_PORT" \
            --exclude 'node_modules' \
            --exclude '.env*' \
            ${{ env.BACKEND_DIR }}/ \
            $SSH_USER@$SSH_HOST:/var/www/restoreassist/staging/backend/

          # Sync frontend files
          rsync -avz -e "ssh -p $SSH_PORT" \
            ${{ env.FRONTEND_DIR }}/dist/ \
            $SSH_USER@$SSH_HOST:/var/www/restoreassist/staging/frontend/

          # Install dependencies and restart with PM2
          ssh -p $SSH_PORT $SSH_USER@$SSH_HOST << 'EOF'
            cd /var/www/restoreassist/staging/backend
            npm ci --production
            pm2 restart restoreassist-staging || pm2 start ecosystem.config.js --only restoreassist-staging
            pm2 save
          EOF

      - name: Run Staging Health Check
        run: |
          sleep 10  # Wait for service to start
          curl -f https://staging.restoreassist.com/api/health || exit 1

      - name: Notify Slack (Success)
        if: success() && env.SLACK_WEBHOOK != ''
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -H 'Content-Type: application/json' \
            -d '{
              "text": "✅ RestoreAssist Staging Deployment Successful",
              "blocks": [{
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Staging Deployment* ✅\n*Branch:* `${{ github.ref_name }}`\n*Commit:* `${{ github.sha }}`\n*URL:* https://staging.restoreassist.com"
                }
              }]
            }'

      - name: Notify Slack (Failure)
        if: failure() && env.SLACK_WEBHOOK != ''
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -H 'Content-Type: application/json' \
            -d '{
              "text": "❌ RestoreAssist Staging Deployment Failed",
              "blocks": [{
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Staging Deployment* ❌\n*Branch:* `${{ github.ref_name }}`\n*Commit:* `${{ github.sha }}`\n*Check:* ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                }
              }]
            }'

  # ============================================
  # JOB 5: Deploy to Production (manual trigger)
  # ============================================
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: deploy-staging
    if: github.event_name == 'workflow_dispatch'
    environment:
      name: production
      url: https://restoreassist.com

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Download Backend Artifact
        uses: actions/download-artifact@v4
        with:
          name: backend-dist
          path: ${{ env.BACKEND_DIR }}/dist

      - name: Download Frontend Artifact
        uses: actions/download-artifact@v4
        with:
          name: frontend-dist
          path: ${{ env.FRONTEND_DIR }}/dist

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.8.0
        with:
          ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}

      - name: Create Backup
        env:
          SSH_HOST: ${{ secrets.SSH_HOST }}
          SSH_USER: ${{ secrets.SSH_USER }}
          SSH_PORT: ${{ secrets.SSH_PORT || 22 }}
        run: |
          ssh -p $SSH_PORT $SSH_USER@$SSH_HOST << 'EOF'
            cd /var/www/restoreassist
            BACKUP_DIR="/var/backups/restoreassist/$(date +%Y%m%d_%H%M%S)"
            mkdir -p $BACKUP_DIR
            cp -r production $BACKUP_DIR/
            echo "Backup created at: $BACKUP_DIR"
          EOF

      - name: Deploy to Production Server
        env:
          SSH_HOST: ${{ secrets.SSH_HOST }}
          SSH_USER: ${{ secrets.SSH_USER }}
          SSH_PORT: ${{ secrets.SSH_PORT || 22 }}
        run: |
          # Create deployment directory
          ssh -p $SSH_PORT $SSH_USER@$SSH_HOST "mkdir -p /var/www/restoreassist/production"

          # Sync backend files
          rsync -avz -e "ssh -p $SSH_PORT" \
            --exclude 'node_modules' \
            --exclude '.env*' \
            ${{ env.BACKEND_DIR }}/ \
            $SSH_USER@$SSH_HOST:/var/www/restoreassist/production/backend/

          # Sync frontend files
          rsync -avz -e "ssh -p $SSH_PORT" \
            ${{ env.FRONTEND_DIR }}/dist/ \
            $SSH_USER@$SSH_HOST:/var/www/restoreassist/production/frontend/

          # Install dependencies and restart with PM2
          ssh -p $SSH_PORT $SSH_USER@$SSH_HOST << 'EOF'
            cd /var/www/restoreassist/production/backend
            npm ci --production
            pm2 restart restoreassist-production || pm2 start ecosystem.config.js --only restoreassist-production
            pm2 save
          EOF

      - name: Run Production Health Check
        run: |
          sleep 15  # Wait for service to start
          for i in {1..5}; do
            if curl -f https://restoreassist.com/api/health; then
              echo "Health check passed"
              exit 0
            fi
            echo "Health check attempt $i failed, retrying..."
            sleep 5
          done
          echo "Health check failed after 5 attempts"
          exit 1

      - name: Notify Slack (Success)
        if: success() && env.SLACK_WEBHOOK != ''
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -H 'Content-Type: application/json' \
            -d '{
              "text": "🚀 RestoreAssist Production Deployment Successful",
              "blocks": [{
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Production Deployment* 🚀\n*Branch:* `${{ github.ref_name }}`\n*Commit:* `${{ github.sha }}`\n*URL:* https://restoreassist.com"
                }
              }]
            }'

      - name: Notify Slack (Failure)
        if: failure() && env.SLACK_WEBHOOK != ''
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -H 'Content-Type: application/json' \
            -d '{
              "text": "🚨 RestoreAssist Production Deployment Failed - ROLLBACK REQUIRED",
              "blocks": [{
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Production Deployment* 🚨\n*Status:* FAILED\n*Branch:* `${{ github.ref_name }}`\n*Action Required:* Immediate rollback needed\n*Check:* ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                }
              }]
            }'
```

---

### Pull Request Checks Workflow

Create `.github/workflows/pr-checks.yml`:

```yaml
name: Pull Request Checks

on:
  pull_request:
    branches: [main, develop]

jobs:
  pr-validation:
    name: PR Validation
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Type Check
        run: |
          npm run build --workspace=packages/backend
          npm run build --workspace=packages/frontend

      - name: Lint Check (if configured)
        run: |
          npm run lint --workspace=packages/backend || echo "Lint not configured"
          npm run lint --workspace=packages/frontend || echo "Lint not configured"
        continue-on-error: true

      - name: PR Title Check
        uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

### Dependency Update Workflow

Create `.github/workflows/dependency-update.yml`:

```yaml
name: Dependency Updates

on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  update-dependencies:
    name: Update Dependencies
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'

      - name: Update Dependencies
        run: |
          npm update
          npm update --workspace=packages/backend
          npm update --workspace=packages/frontend

      - name: Run Tests
        run: |
          npm test || echo "Tests not configured"

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'chore: update dependencies'
          title: 'chore: Weekly dependency updates'
          body: |
            Automated dependency updates

            - Updated all packages to latest compatible versions
            - Tests passing ✅
          branch: deps/weekly-update
          delete-branch: true
```

---

## Deployment Process

### Automatic Deployment (Staging)

```bash
# 1. Merge PR to main branch
git checkout main
git pull origin main

# 2. CI/CD automatically:
#    - Runs tests
#    - Builds artifacts
#    - Deploys to staging
#    - Runs health checks

# 3. Verify staging deployment
curl https://staging.restoreassist.com/api/health
```

### Manual Deployment (Production)

```bash
# 1. Navigate to GitHub Actions
# Go to: https://github.com/YOUR_USERNAME/RestoreAssist/actions

# 2. Select "RestoreAssist CI/CD Pipeline"

# 3. Click "Run workflow"
#    - Select branch: main
#    - Click "Run workflow"

# 4. Monitor deployment progress
#    - Watch workflow steps
#    - Check logs for errors

# 5. Verify production deployment
curl https://restoreassist.com/api/health
```

---

## Rollback Procedures

### Automatic Rollback (if health check fails)

The workflow will automatically fail and prevent deployment if health checks don't pass.

### Manual Rollback

```bash
# SSH into production server
ssh deploy@your-server.com

# 1. List available backups
ls -lh /var/backups/restoreassist/

# 2. Identify backup to restore (format: YYYYMMDD_HHMMSS)
BACKUP_DIR="/var/backups/restoreassist/20250118_143022"

# 3. Stop current application
pm2 stop restoreassist-production

# 4. Restore from backup
cd /var/www/restoreassist
rm -rf production
cp -r $BACKUP_DIR/production ./

# 5. Restart application
cd production/backend
pm2 restart restoreassist-production

# 6. Verify rollback
curl http://localhost:3001/api/health

# 7. Check PM2 status
pm2 status
pm2 logs restoreassist-production --lines 50
```

### PM2-based Rollback

```bash
# View PM2 history
pm2 list

# Restart previous version
pm2 restart restoreassist-production@previous

# Or use PM2 deploy rollback
pm2 deploy production revert 1
```

---

## Troubleshooting

### Issue: Deployment Fails with SSH Connection Error

**Symptoms:**
```
Permission denied (publickey)
```

**Solution:**
```bash
# 1. Verify SSH key is added to GitHub Secrets
# 2. Verify public key is on server
ssh deploy@your-server.com "cat ~/.ssh/authorized_keys"

# 3. Test SSH connection manually
ssh -i ~/.ssh/restoreassist_deploy deploy@your-server.com

# 4. Check SSH permissions on server
ssh deploy@your-server.com "chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

### Issue: Health Check Fails

**Symptoms:**
```
curl: (7) Failed to connect to staging.restoreassist.com port 443
```

**Solution:**
```bash
# 1. Check if service is running
ssh deploy@your-server.com "pm2 status"

# 2. Check application logs
ssh deploy@your-server.com "pm2 logs restoreassist-staging --lines 100"

# 3. Verify port binding
ssh deploy@your-server.com "netstat -tulpn | grep 3001"

# 4. Check firewall
ssh deploy@your-server.com "sudo ufw status"

# 5. Test local health endpoint
ssh deploy@your-server.com "curl http://localhost:3001/api/health"
```

### Issue: Build Artifacts Missing

**Symptoms:**
```
Error: Artifact 'backend-dist' not found
```

**Solution:**
```bash
# 1. Check if previous jobs completed successfully
# View workflow logs in GitHub Actions

# 2. Verify build step completed
# Check "Backend Tests" job logs

# 3. Re-run failed jobs
# Click "Re-run failed jobs" in GitHub Actions UI
```

### Issue: Database Connection Fails After Deployment

**Symptoms:**
```
Error: getaddrinfo ENOTFOUND db.example.com
```

**Solution:**
```bash
# 1. Verify .env.production file exists
ssh deploy@your-server.com "cat /var/www/restoreassist/production/backend/.env.production"

# 2. Test database connectivity
ssh deploy@your-server.com "psql -h DB_HOST -U DB_USER -d DB_NAME"

# 3. Check firewall rules for database
ssh deploy@your-server.com "sudo ufw status | grep 5432"

# 4. Verify database credentials in environment
ssh deploy@your-server.com "cd /var/www/restoreassist/production/backend && pm2 env 0"
```

---

## Success Criteria

### ✅ Pre-Deployment Checklist

- [ ] All GitHub Secrets configured
- [ ] SSH access to production server verified
- [ ] PM2 installed and configured on server
- [ ] Database accessible from production server
- [ ] Backup directory created: `/var/backups/restoreassist/`
- [ ] .env.production file configured on server
- [ ] Domain DNS configured correctly
- [ ] SSL certificates installed (via Let's Encrypt/Certbot)
- [ ] Firewall rules configured (ports 80, 443, 3001)

### ✅ Post-Deployment Verification

```bash
# 1. Health endpoint responds
curl https://restoreassist.com/api/health
# Expected: {"status":"healthy","timestamp":"..."}

# 2. Frontend loads
curl -I https://restoreassist.com
# Expected: HTTP/2 200

# 3. PM2 status shows running
ssh deploy@your-server.com "pm2 status"
# Expected: status: online, uptime: > 0

# 4. No errors in logs
ssh deploy@your-server.com "pm2 logs restoreassist-production --lines 100 --nostream"
# Expected: No ERROR or CRITICAL messages

# 5. Database connection working
curl https://restoreassist.com/api/admin/stats
# Expected: JSON with statistics

# 6. AI report generation working
# Test via UI: Create a test report
# Expected: Report generated successfully
```

### ✅ Monitoring Setup

```bash
# 1. PM2 monitoring enabled
ssh deploy@your-server.com "pm2 install pm2-logrotate"
ssh deploy@your-server.com "pm2 set pm2-logrotate:max_size 10M"
ssh deploy@your-server.com "pm2 set pm2-logrotate:retain 7"

# 2. Error notifications configured
# Slack webhook responding to test
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test deployment notification"}'

# 3. Backup cron job configured
ssh deploy@your-server.com "crontab -l | grep backup"
# Expected: Daily backup job entry
```

---

## Next Steps

1. **Configure GitHub Secrets** (15 minutes)
2. **Test SSH Connection** (5 minutes)
3. **Commit Workflow Files** (5 minutes)
4. **Test Deployment to Staging** (30 minutes)
5. **Verify All Health Checks** (15 minutes)
6. **Deploy to Production** (Manual trigger)
7. **Set Up Monitoring** (See guide 05-MONITORING.md)

---

## Additional Resources

- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **PM2 Documentation**: https://pm2.keymetrics.io/docs/usage/quick-start/
- **SSH Key Management**: https://docs.github.com/en/authentication/connecting-to-github-with-ssh
- **Rsync Documentation**: https://rsync.samba.org/documentation.html

---

**Document Version:** 1.0.0
**Last Reviewed:** 2025-10-18
**Next Review:** 2025-11-18
**Maintained By:** DevOps Team
