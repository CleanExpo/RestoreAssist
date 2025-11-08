# Multi-LLM Provider Setup Guide

## ✅ What's Been Completed

1. **Multi-Provider LLM System** (`lib/llm-providers.ts`)
   - Unified API supporting Anthropic Claude, OpenAI GPT, and Google Gemini
   - Automatic provider selection based on user preference
   - API key validation for all providers

2. **Database Schema Updates** (`prisma/schema.prisma`)
   - Added `openaiApiKey`, `googleApiKey`, `preferredLLMProvider`, `preferredLLMModel` fields

3. **API Key Management** (`app/api/user/api-key/route.ts`)
   - Multi-provider GET/POST/DELETE endpoints
   - Validates API keys before saving
   - Returns status for all 3 providers

4. **RestoreAssist Integration**
   - Updated `generate-enhanced` endpoint to use preferred provider
   - Updated `reportGenerator` to use UnifiedLLMClient
   - Admin bypass support for all providers

5. **NPM Packages Installed**
   - `openai` - OpenAI SDK
   - `@google/generative-ai` - Google Gemini SDK

## 🚨 CRITICAL: Database Migration Required

**You MUST run this SQL in Supabase before the system will work:**

### Step 1: Open Supabase SQL Editor
1. Go to https://app.supabase.com
2. Select your RestoreAssist project
3. Click "SQL Editor" in the left sidebar
4. Click "New query"

### Step 2: Run Migration SQL
Copy and paste the following SQL:

```sql
-- Add multi-LLM provider support fields to User table
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "openaiApiKey" TEXT,
ADD COLUMN IF NOT EXISTS "googleApiKey" TEXT,
ADD COLUMN IF NOT EXISTS "preferredLLMProvider" TEXT DEFAULT 'anthropic',
ADD COLUMN IF NOT EXISTS "preferredLLMModel" TEXT;

-- Update existing users to have anthropic as default provider
UPDATE "User"
SET "preferredLLMProvider" = 'anthropic'
WHERE "preferredLLMProvider" IS NULL;

-- Create index for faster provider lookups
CREATE INDEX IF NOT EXISTS "User_preferredLLMProvider_idx" ON "User"("preferredLLMProvider");
```

### Step 3: Execute
Click "Run" to execute the migration.

**⚠️ The migration file is also saved at:** `prisma/migrations/add_multi_llm_provider_support.sql`

---

## 📝 Testing Checklist

After running the migration, test the following:

### 1. Login Test
- [ ] Navigate to https://restoreassist.app/login
- [ ] Login with your credentials
- [ ] Verify you reach the dashboard

### 2. API Key Management Test
- [ ] Go to Settings → API Key Management
- [ ] Try adding an Anthropic API key
  - Format: `sk-ant-...`
  - Should validate before saving
- [ ] Try adding an OpenAI API key
  - Format: `sk-...`
  - Should validate before saving
- [ ] Try adding a Google API key
  - Format: `AIza...`
  - Should validate before saving
- [ ] Verify masked keys display correctly
- [ ] Set a preferred provider
- [ ] Delete a key to test DELETE endpoint

### 3. RestoreAssist Report Generation Test
- [ ] Navigate to Dashboard → RestoreAssist
- [ ] Create a new inspection
- [ ] Fill in basic details
- [ ] Attempt to generate enhanced report
- [ ] Should receive error if no API key set
- [ ] Add API key in Settings
- [ ] Retry generation - should succeed
- [ ] Verify report uses your preferred provider

### 4. Check for Console Errors
Open browser DevTools (F12) and check for:
- [ ] No 500 errors on /api/reports
- [ ] No 500 errors on /api/analytics
- [ ] No 400 errors on /api/user/api-key
- [ ] No 500 errors on /api/subscription

---

## 🎯 User Experience Flow

### For Regular Users:
1. User logs in → Goes to dashboard
2. Tries to generate report → Gets error: "API key required"
3. Goes to Settings → API Key Management
4. Chooses provider (Anthropic/OpenAI/Google)
5. Enters API key → System validates it
6. Returns to RestoreAssist → Generate report succeeds

### For Admin Users:
1. Admin logs in → Goes to dashboard
2. Can generate reports using system env vars OR personal keys
3. Falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY` from environment

---

## 🔧 Troubleshooting

### "API key required" error
**Problem**: User tries to generate report but has no API key set.

**Solution**:
1. Go to Settings → API Key Management
2. Add API key for your preferred provider
3. System will validate it before saving

### "Invalid API key" error
**Problem**: API key validation failed.

**Solutions**:
- **Anthropic**: Key must start with `sk-ant-`
- **OpenAI**: Key must start with `sk-`
- **Google**: Key must start with `AIza`
- Verify key is active and has credits
- Try key in provider's playground first

### 500 errors on dashboard
**Problem**: Database schema not updated.

**Solution**: Run the migration SQL in Supabase (see Step 1-3 above)

### Build errors on Vercel
**Problem**: Missing dependencies or Prisma client not generated.

**Solution**:
```bash
npm install
npx prisma generate
git add -A
git commit -m "Update Prisma client"
git push
```

---

## 📚 Available Providers

### Anthropic Claude
- **Models**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Best for**: Long context, reasoning, professional writing
- **API Key**: Get from https://console.anthropic.com

### OpenAI GPT
- **Models**: GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- **Best for**: General purpose, fast responses, coding
- **API Key**: Get from https://platform.openai.com

### Google Gemini
- **Models**: Gemini 1.5 Pro, Gemini 1.5 Flash
- **Best for**: Multimodal, massive context window (2M tokens)
- **API Key**: Get from https://makersuite.google.com/app/apikey

---

## 🔐 Environment Variables (Admin)

If you want admin users to have system-wide fallback keys:

```bash
# Add these to Vercel environment variables
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

Then deploy:
```bash
vercel deploy --prod
```

---

## ✅ Final Checklist Before Handover

- [ ] Database migration executed successfully in Supabase
- [ ] Can login without errors
- [ ] Can access Settings → API Key Management
- [ ] Can add/view/delete API keys
- [ ] Can generate RestoreAssist reports with user API key
- [ ] No console errors on dashboard
- [ ] /api/reports endpoint works
- [ ] /api/analytics endpoint works
- [ ] /api/subscription endpoint works
- [ ] /api/user/api-key endpoint works

---

## 📞 Support

If you encounter any issues:
1. Check browser console for errors (F12)
2. Check Vercel deployment logs
3. Check Supabase logs
4. Verify migration ran successfully

**Migration file location**: `prisma/migrations/add_multi_llm_provider_support.sql`
