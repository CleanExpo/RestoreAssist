# MCP Setup Guide - API Keys & Tokens

Complete this checklist to enable all RestoreAssist MCP servers.

## ✅ Already Configured

- [x] GitHub MCP - Token already set
- [x] Context7 - No credentials needed
- [x] 21st Magic - API key already set
- [x] Playwright - No credentials needed
- [x] Google Drive - OAuth (will prompt on first use)
- [x] Markdownify - No credentials needed

## 🔧 Needs Configuration

### 1. Stripe MCP

**Purpose**: Payment processing, subscription management, invoice creation

**Get Your Stripe Secret Key:**
1. Go to: https://dashboard.stripe.com/apikeys
2. Sign in or create account
3. Find "Secret key" (starts with `sk_test_` for test mode)
4. Click "Reveal test key" or "Reveal live key"
5. Copy the key

**Paste here:**
```
STRIPE_API_KEY=sk_test_____________________________________
```

---

### 2. Vercel MCP

**Purpose**: Manage deployments, view logs, configure environment variables

**Get Your Vercel Token:**
1. Go to: https://vercel.com/account/tokens
2. Sign in
3. Click "Create Token"
4. Name: "Claude Code MCP" or "RestoreAssist"
5. Scope: Select your team/personal account
6. Expiration: Choose based on security needs
7. Click "Create"
8. Copy the token (starts with something like `vercel_`)

**Paste here:**
```
VERCEL_TOKEN=_____________________________________________
```

---

### 3. Google Cloud MCP

**Purpose**: Manage OAuth clients, APIs, GCP resources

**Setup Google Cloud CLI:**

**Option A: If you have gcloud installed**
```bash
# Authenticate your user account
gcloud auth login

# Authenticate for application
gcloud auth application-default login
```

**Option B: If you don't have gcloud**
1. Download: https://cloud.google.com/sdk/docs/install
2. Install Google Cloud SDK
3. Run the commands above

**Alternatively, skip for now** - Only needed if you want to manage GCP resources

---

## 🚀 After You Have the Credentials

Once you have the API keys/tokens above:

1. Let me know you're ready
2. I'll update your `mcp.json` configuration
3. You'll restart Claude Code
4. All MCPs will be fully functional!

## 📋 Credentials Checklist

- [ ] Stripe API Key obtained
- [ ] Vercel Token obtained
- [ ] Google Cloud CLI installed & authenticated (optional)

## Notes

- **Test vs Production**: Stripe has test and live keys - use test for development
- **Security**: Never commit these keys to git repositories
- **Expiration**: Vercel tokens can expire - create new ones as needed
- **Scopes**: Ensure tokens have appropriate permissions for your needs

---

## Quick Copy Format

When ready, provide me with:

```bash
# Stripe
STRIPE_API_KEY=sk_test_your_key_here

# Vercel
VERCEL_TOKEN=your_token_here

# Google Cloud (optional)
# Already authenticated via gcloud CLI
```

I'll update your configuration automatically!
