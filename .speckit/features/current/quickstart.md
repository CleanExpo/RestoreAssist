# Quick Start: OAuth Authentication Fix

**Feature:** fix-oauth-authentication
**Last Updated:** 2025-01-22
**Estimated Setup Time:** 15 minutes

## Prerequisites

- Node.js 20+ installed
- PostgreSQL running (or use in-memory mode)
- Google Cloud Console access (for OAuth configuration)
- Git installed

## Step 1: Clone and Install (5 minutes)

```bash
# If not already cloned
git clone https://github.com/your-org/restoreassist.git
cd restoreassist

# Checkout feature branch
git checkout Testing-Branch

# Install dependencies
npm install

# Install backend dependencies
cd packages/backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ../..
```

## Step 2: Google OAuth Configuration (10 minutes)

### A. Google Cloud Console Setup

1. **Navigate to Google Cloud Console:**
   - Go to https://console.cloud.google.com
   - Select your project (or create new: "RestoreAssist")

2. **Enable Google+ API:**
   - APIs & Services → Library
   - Search "Google+ API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials:**
   - APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "RestoreAssist Landing Page"

4. **Configure Authorized Origins:**
   Add these origins (click "+ Add URI"):
   ```
   http://localhost:5173
   http://localhost:3000
   https://restoreassist.app
   https://www.restoreassist.app
   ```

5. **Configure Redirect URIs:**
   Add these redirects:
   ```
   http://localhost:3001/api/integrations/google-drive/callback
   https://restore-assist-backend.vercel.app/api/integrations/google-drive/callback
   ```

6. **Save and Copy Credentials:**
   - Click "Create"
   - **Copy Client ID** (starts with numbers, ends with `.apps.googleusercontent.com`)
   - **Copy Client Secret** (keep this secret!)

7. **Add Test Users (IMPORTANT):**
   - OAuth consent screen → Test users
   - Click "+ Add Users"
   - Add your Google email addresses:
     ```
     airestoreassist@gmail.com
     phil.mcgurk@gmail.com
     zedhfrash25@gmail.com
     [your email here]
     ```
   - Save

8. **Set Publishing Status to "Testing":**
   - OAuth consent screen → Publishing status
   - Select "Testing" (allows whitelisted users only)

### B. Wait for Propagation

**CRITICAL:** Google OAuth configuration takes **10-15 minutes to propagate**. Set a timer and do not test authentication until this time has elapsed.

☕ Take a break, grab coffee, this is normal!

## Step 3: Environment Configuration (5 minutes)

### A. Backend Configuration

```bash
cd packages/backend

# If .env.local doesn't exist, create it from .env
cp .env .env.local

# Edit .env.local with your favorite editor
# Windows: notepad .env.local
# Mac/Linux: nano .env.local
```

**Required values in `.env.local`:**

```bash
# Server
PORT=3001
NODE_ENV=development

# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-[your-key-here]

# JWT Authentication
JWT_SECRET=[generate-random-32-char-string]
JWT_REFRESH_SECRET=[generate-different-32-char-string]
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database Configuration
USE_POSTGRES=false  # Set to true if using PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restoreassist
DB_USER=postgres
DB_PASSWORD=[your-db-password]

# Google OAuth (PASTE FROM GOOGLE CLOUD CONSOLE)
GOOGLE_CLIENT_ID=[paste-client-id-here]
GOOGLE_CLIENT_SECRET=[paste-client-secret-here]
GOOGLE_REDIRECT_URI=http://localhost:3001/api/integrations/google-drive/callback

# CORS Origins
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000,https://restoreassist.app

# Base URL
BASE_URL=http://localhost:3001

# Stripe (optional for auth testing)
STRIPE_SECRET_KEY=[your-stripe-key-or-leave-blank]
```

**Generate JWT Secrets:**

```bash
# Node.js one-liner to generate random 32-char strings
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Run this twice, use output for JWT_SECRET and JWT_REFRESH_SECRET
```

### B. Frontend Configuration

```bash
cd ../frontend

# Create .env if it doesn't exist
cp .env.example .env 2>/dev/null || touch .env

# Edit .env
# Windows: notepad .env
# Mac/Linux: nano .env
```

**Required values in `.env`:**

```bash
# Google OAuth Client ID (same as backend, but with VITE_ prefix)
VITE_GOOGLE_CLIENT_ID=[paste-same-client-id-here]

# API Base URL
VITE_API_URL=http://localhost:3001

# Sentry (optional)
VITE_SENTRY_DSN=[your-sentry-dsn-or-leave-blank]
```

## Step 4: Database Setup (2 minutes)

### Option A: PostgreSQL Database

```bash
cd packages/backend

# Run Prisma migration to create auth_attempts table
npx prisma migrate dev --name add-auth-attempts-table

# Seed database with test data (optional)
npm run db:seed
```

### Option B: In-Memory Mode (No PostgreSQL Required)

```bash
# In packages/backend/.env.local, ensure:
USE_POSTGRES=false
```

**Note:** In-memory mode loses data on server restart. Use for quick testing only.

## Step 5: Start Development Servers (1 minute)

### Terminal 1: Backend

```bash
cd packages/backend
npm run dev

# You should see:
# ✓ Backend server running on http://localhost:3001
# ✓ Environment configuration valid
# ✓ Google OAuth Client ID: 292141944467-...
```

### Terminal 2: Frontend

```bash
cd packages/frontend
npm run dev

# You should see:
# ✓ Vite dev server running at http://localhost:5173
# ✓ Press 'o' to open in browser
```

## Step 6: Test Authentication Flow (5 minutes)

### Before Testing: Verify Propagation Time

**Did you wait 10-15 minutes after configuring Google Cloud Console?**
- ✅ Yes → Proceed to testing
- ❌ No → **WAIT!** Set a timer, premature testing will fail

### Test Steps

1. **Open Browser:**
   ```
   http://localhost:5173
   ```

2. **Click "Sign in with Google" Button:**
   - Should activate on **first click** (no double-click)
   - Google OAuth popup should appear within 2 seconds

3. **Select Google Account:**
   - Choose test user email (must be whitelisted)
   - Approve requested permissions

4. **Verify Success:**
   - Redirected to dashboard within 5 seconds
   - User name and profile picture displayed
   - Trial activation message appears

5. **Check Backend Logs:**
   ```bash
   # In backend terminal, you should see:
   ✓ OAuth token exchanged for user: airestoreassist@gmail.com
   ✓ Trial eligibility validated (fraud score: 0)
   ✓ Trial activated successfully
   ✓ Session created with JWT token
   ```

### Troubleshooting

#### Error: "The given origin is not allowed for the given client ID"

**Cause:** Google OAuth configuration hasn't propagated yet.

**Solution:**
1. Verify you added `http://localhost:5173` to Authorized JavaScript Origins
2. Wait 10-15 minutes from when you clicked "Save" in Google Cloud Console
3. Clear browser cache: Ctrl+Shift+Delete → Cookies → Clear all
4. Retry authentication

#### Error: "Access blocked: Authorization Error"

**Cause:** Your email is not whitelisted as a test user.

**Solution:**
1. Go to Google Cloud Console → OAuth consent screen → Test users
2. Add your email address
3. Save
4. Wait 5 minutes for propagation
5. Retry authentication

#### Error: "Trial Activation Failed"

**Cause:** Fraud detection blocked trial (likely already used 1 trial).

**Solution:**
1. Check backend logs for fraud_score value
2. If score >= 70, you've exceeded trial limit (1 per email)
3. Use admin override endpoint (see API docs)
4. Or test with different Google account

#### Button Requires Double-Click

**Cause:** Cookie consent backdrop blocking clicks (should be fixed).

**Solution:**
1. Verify `CookieConsent.tsx` has `pointer-events-none` when invisible
2. Check for other overlays with high z-index
3. Inspect element with browser DevTools → check for blocking overlays

## Step 7: Run Tests (Optional, 5 minutes)

```bash
# Backend unit tests
cd packages/backend
npm test

# Frontend component tests
cd ../frontend
npm test

# E2E tests with Playwright
cd ../..
npm run test:e2e

# Specific auth tests
npx playwright test tests/e2e-claude/auth/
```

## Common Development Commands

```bash
# Start both frontend and backend concurrently
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Format code
npm run format

# Clear all caches and reinstall
npm run clean
rm -rf node_modules package-lock.json
npm install
```

## Environment Variables Reference

| Variable | Required | Location | Description |
|----------|----------|----------|-------------|
| GOOGLE_CLIENT_ID | ✅ Yes | Frontend .env, Backend .env.local | OAuth Client ID from Google Cloud Console |
| GOOGLE_CLIENT_SECRET | ✅ Yes | Backend .env.local ONLY | OAuth secret (never in frontend!) |
| JWT_SECRET | ✅ Yes | Backend .env.local | Random 32+ char string for JWT signing |
| JWT_REFRESH_SECRET | ✅ Yes | Backend .env.local | Different random 32+ char string |
| ANTHROPIC_API_KEY | ✅ Yes | Backend .env.local | Claude API key for report generation |
| USE_POSTGRES | ⚠️ Recommended | Backend .env.local | `true` for PostgreSQL, `false` for in-memory |
| DB_HOST | ⚠️ If Postgres | Backend .env.local | Database hostname |
| DB_PASSWORD | ⚠️ If Postgres | Backend .env.local | Database password |
| ALLOWED_ORIGINS | ✅ Yes | Backend .env.local | Comma-separated CORS origins |
| STRIPE_SECRET_KEY | ❌ Optional | Backend .env.local | For payment processing (not required for auth) |
| VITE_SENTRY_DSN | ❌ Optional | Frontend .env | For error monitoring |

## Next Steps

After verifying authentication works:

1. **Run Quality Checks:**
   ```bash
   /speckit.analyze
   ```

2. **Generate Task Breakdown:**
   ```bash
   /speckit.tasks
   ```

3. **Begin Implementation:**
   ```bash
   /speckit.implement
   ```

4. **Deploy to Staging:**
   - Follow deployment guide in `DEPLOYMENT.md`

## Support

**Issues?**
- Check backend logs for detailed error messages
- Verify Google Cloud Console configuration
- Ensure 15-minute propagation delay elapsed
- Try clearing browser cache completely

**Still stuck?**
- Email: support@restoreassist.com.au
- GitHub Issues: https://github.com/your-org/restoreassist/issues
- Slack: #restoreassist-dev

---

**Setup Complete!** 🎉

You should now have:
- ✅ Backend running on http://localhost:3001
- ✅ Frontend running on http://localhost:5173
- ✅ Google OAuth configured and working
- ✅ Test users whitelisted
- ✅ Single-click button activation verified

**Total Setup Time:** 15-20 minutes (including Google propagation wait)
