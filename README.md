# RestoreAssist

[![Build Status](https://img.shields.io/github/workflow/status/restoreassist/restoreassist/CI)](https://github.com/restoreassist/restoreassist/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## Overview

RestoreAssist is an AI-powered disaster restoration documentation platform that streamlines the creation of comprehensive restoration reports for insurance claims and project management. Built with cutting-edge AI technology powered by Claude from Anthropic, RestoreAssist transforms the traditionally time-consuming process of creating restoration documentation into a streamlined, efficient workflow.

## Features

### Core Features
- **AI-Powered Report Generation**: Leverage Claude AI to generate detailed restoration reports
- **Australian Standards Compliance**: Built-in compliance with Australian building codes and regulations
- **Multi-Damage Type Support**: Water, fire, storm, flood, mould, biohazard, and impact damage
- **Comprehensive Estimating**: Itemised cost estimates with labour and materials breakdown
- **Professional Documentation**: Generate authority to proceed documents and compliance notes

### Technical Features
- **Modern Architecture**: Microservices-based architecture with separate frontend and backend
- **Real-time Processing**: WebSocket support for real-time updates
- **Secure Authentication**: JWT-based authentication with refresh tokens
- **Google OAuth Integration**: Seamless sign-in with Google accounts
- **Stripe Payment Integration**: Subscription management and payment processing
- **Email Notifications**: SMTP, SendGrid, and Resend support
- **Error Monitoring**: Sentry integration for production error tracking
- **Database Flexibility**: Support for PostgreSQL with Prisma ORM
- **CRM Integrations**: ServiceM8 and Ascora CRM support

## Technology Stack

- **Frontend**: React 18.2, TypeScript 5.3, Vite, TailwindCSS 4.1, Radix UI
- **Backend**: Node.js 20+, Express.js, TypeScript, Prisma ORM
- **Database**: PostgreSQL with Prisma Accelerate
- **AI**: Anthropic Claude SDK
- **Authentication**: JWT, Google OAuth
- **Payments**: Stripe
- **Email**: SMTP/SendGrid/Resend/AWS SES
- **Monitoring**: Sentry
- **Testing**: Playwright, Jest

## Quick Start

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/restoreassist.git
cd restoreassist
npm install
```

Copy and configure environment variables:

```bash
# Copy example files to create local environment configuration
cp packages/backend/.env.example packages/backend/.env.local
cp packages/frontend/.env.example packages/frontend/.env.local

# CRITICAL SECURITY STEPS:
# 1. Generate secure JWT secrets (run this command TWICE for different secrets):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. Edit .env.local files with your REAL credentials
# 3. NEVER commit .env.local files to version control
# 4. NEVER use example/default values in production
```

⚠️ **SECURITY WARNING**: See [SECURITY_INCIDENT.md](SECURITY_INCIDENT.md) for critical security requirements.

Start development servers:

```bash
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

## Documentation

- [Frontend Documentation](packages/frontend/README.md)
- [Backend Documentation](packages/backend/README.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Environment Variables](ENV_VARIABLES.md)

## Project Structure

```
restoreassist/
├── packages/
│   ├── frontend/          # React frontend application
│   ├── backend/           # Express backend API
│   └── sdk/               # Shared SDK package
├── agents/                # Claude agent configurations
├── .claude/               # Claude-specific settings
├── ui/                    # UI component library (shadcn)
├── docs/                  # Additional documentation
└── tests/                 # E2E tests
```

## Google OAuth Troubleshooting

### Common Authentication Issues

#### Issue: "Sign in was cancelled" or Popup Closes Immediately

**Cause:** Google OAuth popup was closed before completing authentication.

**Solutions:**
- Don't close the popup window manually
- Check if popup blocker is preventing the OAuth window from opening
- Try disabling browser extensions that might interfere
- Use Incognito/Private mode to test without extensions

---

#### Issue: "Access was denied" or "access_blocked"

**Cause:** Google OAuth app is in "Testing" mode and your email is not whitelisted.

**Solutions:**
1. Verify your email is added to test users in Google Cloud Console:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to **APIs & Services** > **OAuth consent screen**
   - Scroll to **Test users** section
   - Click **+ ADD USERS** and add your email address
   - Save changes

2. Wait 10-15 minutes for changes to propagate

3. Clear browser cache and cookies for `localhost` and `restoreassist.app`

4. Whitelisted test users:
   - airestoreassist@gmail.com
   - phill.mcgurk@gmail.com
   - zenithfresh25@gmail.com

---

#### Issue: "redirect_uri_mismatch"

**Cause:** OAuth callback URL not authorized in Google Cloud Console.

**Solutions:**
1. Verify authorized redirect URIs in Google Cloud Console:
   - Go to **APIs & Services** > **Credentials**
   - Click your OAuth 2.0 Client ID
   - Check **Authorized redirect URIs** includes:
     - `http://localhost:5173/auth/callback`
     - `https://restoreassist.app/auth/callback`
     - `http://localhost:5173` (for development)

2. Add missing URLs and save

3. Wait 5-10 minutes for changes to propagate

---

#### Issue: "invalid_client" or "Client authentication failed"

**Cause:** Google Client ID or Client Secret is incorrect or missing.

**Solutions:**
1. Verify environment variables:
   ```bash
   # Backend .env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret

   # Frontend .env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

2. Ensure Client ID matches exactly (no extra spaces or quotes)

3. Regenerate Client Secret if unsure:
   - Go to Google Cloud Console > **Credentials**
   - Delete old Client Secret
   - Create new Client Secret
   - Update both backend and frontend .env files

4. Restart development servers:
   ```bash
   npm run dev
   ```

---

#### Issue: "You have already used your free trial"

**Cause:** Trial fraud detection detected previous trial usage.

**Solutions:**
1. **Legitimate Users:** Contact support at support@restoreassist.com.au with your email address

2. **Developers/Testing:** Use admin API to clear trial data:
   ```bash
   curl -X POST http://localhost:3001/api/admin-trial/clear-trial/your-email@example.com
   ```

3. **Fraud Prevention Limits:**
   - 1 trial per email address
   - 1 trial per device (based on fingerprint)
   - If fraud score exceeds 70, trial is blocked

4. See [Fraud Detection Documentation](tests/e2e-claude/auth/fraud-detection.spec.ts) for details

---

#### Issue: Authentication Succeeds but Dashboard Shows Loading Forever

**Cause:** JWT token not being set correctly or session not created.

**Solutions:**
1. Check browser console for errors (F12 > Console)

2. Verify cookies are being set:
   - F12 > Application > Cookies
   - Look for `auth_token` or `access_token`
   - Should be `httpOnly` and `secure` (in production)

3. Check API response:
   ```bash
   # Get current user
   curl http://localhost:3001/api/trial-auth/me \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. Verify backend logs:
   ```bash
   # Should see:
   # ✅ Auth successful: [attempt-id] - user@example.com
   ```

5. Check database for user and session records:
   ```sql
   SELECT * FROM users WHERE email = 'your-email@example.com';
   SELECT * FROM sessions WHERE user_id = 'user-xxx';
   ```

---

#### Issue: "This device has already been used for a free trial"

**Cause:** Device fingerprint matches a previous trial activation.

**Solutions:**
1. **Legitimate Users:** Contact support for device reset

2. **Developers:** Clear device fingerprint:
   ```bash
   # Clear browser storage
   # F12 > Application > Clear storage

   # Or use admin API
   curl -X POST http://localhost:3001/api/admin-trial/clear-trial/your-email@example.com
   ```

3. **Understanding Device Fingerprinting:**
   - Based on: IP address, user agent, canvas fingerprint, WebGL, timezone, screen resolution
   - Hash stored in `device_fingerprints` table
   - Max 1 trial per device by default

---

#### Issue: OAuth Works Locally but Fails in Production

**Cause:** Production URLs not configured correctly.

**Solutions:**
1. Verify production URLs in Google Cloud Console:
   - Authorized JavaScript origins: `https://restoreassist.app`
   - Authorized redirect URIs: `https://restoreassist.app/auth/callback`

2. Check environment variables on Vercel/production:
   ```bash
   # Ensure these match production:
   VITE_APP_URL=https://restoreassist.app
   VITE_API_URL=https://api.restoreassist.app
   GOOGLE_CLIENT_ID=your-production-client-id
   ```

3. Verify CORS settings allow production domain

4. Check SSL certificate is valid (required for OAuth)

---

### Debugging Tools

#### View Authentication Logs

Backend logs show auth attempts in real-time:

```bash
# Successful login
✅ Auth successful: attempt-abc123 - user@example.com

# Failed login
❌ Auth failed: attempt-def456 - access_denied
```

#### Check Auth Success Rate

Backend displays auth metrics on startup:

```bash
🔐 Auth success rate (24h): 85.3% (120/141 attempts)
```

#### Database Queries

```sql
-- Recent auth attempts
SELECT * FROM auth_attempts
ORDER BY attempted_at DESC
LIMIT 10;

-- Failed attempts by error code
SELECT oauth_error_code, COUNT(*) as count
FROM auth_attempts
WHERE success = false
GROUP BY oauth_error_code
ORDER BY count DESC;

-- Suspicious IPs (high failure rate)
SELECT ip_address, COUNT(*) as failures
FROM auth_attempts
WHERE success = false
  AND attempted_at >= NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) >= 10;
```

#### Sentry Error Monitoring

Failed auth attempts are automatically sent to Sentry with:
- Error code and message
- Sanitized email (***@domain.com)
- Sanitized IP (192.168.x.x)
- Retry count and error type tags

View in Sentry dashboard: Issues tagged with `auth_failure`

---

### Test User Mode

For development and testing without Google OAuth:

1. Enable test mode in backend `.env`:
   ```bash
   TEST_USER_MODE=true
   ```

2. Frontend will show "Sign in as Test User" button

3. Test user bypasses fraud detection and OAuth flow

4. See [Test User Mode Spec](tests/e2e-claude/auth/test-user-mode.spec.ts)

---

### Getting Help

If you're still experiencing issues:

1. **Check Logs:**
   - Browser console (F12 > Console)
   - Backend terminal output
   - Sentry error dashboard

2. **Collect Information:**
   - Error message (exact text)
   - Browser and version
   - Steps to reproduce
   - Screenshots

3. **Contact Support:**
   - Email: support@restoreassist.com.au
   - GitHub Issues: [Report a bug](https://github.com/your-org/restoreassist/issues)

4. **Useful Documentation:**
   - [Quick Start Guide](.speckit/features/current/quickstart.md)
   - [OAuth Configuration](.speckit/features/current/research.md)
   - [Data Model](.speckit/features/current/data-model.md)
   - [E2E Tests](tests/e2e-claude/auth/)

---

## Security

### Critical Security Requirements

⚠️ **IMPORTANT**: This application requires proper secret configuration for secure operation.

#### Required Secrets

1. **JWT Secrets** (MUST be unique and random):
   ```bash
   # Generate two DIFFERENT secrets:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   - `JWT_SECRET`: For access token signing
   - `JWT_REFRESH_SECRET`: For refresh token signing (MUST be different from JWT_SECRET)

2. **Stripe API Keys**:
   - Use `sk_test_...` for development
   - Use `sk_live_...` for production only
   - NEVER expose secret keys to frontend

3. **OAuth Secrets**:
   - `GOOGLE_CLIENT_SECRET`: Keep strictly confidential
   - Configure correct redirect URIs in Google Cloud Console

4. **Database Credentials**:
   - Use strong passwords
   - Rotate regularly
   - Use connection pooling with SSL

#### Security Best Practices

- **Never commit** `.env.local` files to version control
- **Never use** example/default values in production
- **Always rotate** secrets if exposed
- **Use environment-specific** credentials (dev/staging/prod)
- **Enable monitoring** for failed authentication attempts
- **Implement rate limiting** on authentication endpoints
- **Use HTTPS** in production
- **Enable CORS** with specific allowed origins

#### Security Validation

The application includes runtime security checks that will:
- Fail to start if secrets are missing
- Reject default/example secret values
- Validate API key formats
- Log security warnings

See [SECURITY_INCIDENT.md](SECURITY_INCIDENT.md) for detailed security requirements and incident response procedures.

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-org/restoreassist/issues)
- **Email Support**: support@restoreassist.com.au

## Licence

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**RestoreAssist** - Transforming disaster restoration documentation with AI

Copyright © 2025 RestoreAssist. All rights reserved.
