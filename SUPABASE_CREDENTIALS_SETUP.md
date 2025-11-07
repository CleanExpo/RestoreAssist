# Supabase Credentials Setup Guide

## ✅ What's Already Done

I've updated your Supabase API credentials in `.env.local`:
- ✅ Supabase URL: `https://qwoggbbavikzhypzodcr.supabase.co`
- ✅ Anon Key: Updated
- ✅ Service Role Key: Updated

## 🔐 What You Need to Do (Simple 3-Step Process)

### Step 1: Get Your Database Connection String

1. Go to: https://supabase.com/dashboard/project/qwoggbbavikzhypzodcr/settings/database
2. Scroll down to find **"Connection string"** section
3. Click on the **"URI"** tab (not Pooling, not Session)
4. You'll see a connection string that looks like:
   ```
   postgresql://postgres.qwoggbbavikzhypzodcr:[YOUR-PASSWORD]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
   ```
5. **Copy this entire string** (including the password)

### Step 2: Update .env.local

1. Open the file: `.env.local` (in your project root)
2. Find the line that says: `DATABASE_URL=YOUR_CONNECTION_STRING_HERE`
3. Replace `YOUR_CONNECTION_STRING_HERE` with the connection string you copied
4. Do the same for the `DIRECT_URL=` line
5. Save the file

### Step 3: Update .env (Main Environment File)

1. Open the file: `.env` (in your project root)
2. Find the line starting with: `DATABASE_URL=postgres://postgres.ithmbupvmriruprrdiob:...`
3. Replace that entire line with: `DATABASE_URL=` followed by your connection string
4. Find the line starting with: `DIRECT_URL=postgres://postgres.ithmbupvmriruprrdiob:...`
5. Replace that entire line with: `DIRECT_URL=` followed by your connection string
6. Save the file

## That's It! 🎉

Your Supabase credentials will be fully updated and secure.

### Files Updated:
- ✅ `.env.local` - API keys done, connection string waiting for you
- ⏳ `.env` - Waiting for your connection string update
- ⏳ `.env.docker` - I'll update this once you confirm the above works

### Security Notes:
- ✅ All `.env*` files are in `.gitignore` so they won't be committed to git
- ✅ Your credentials are safe and won't be exposed
- ✅ The old credentials from the previous project (`ithmbupvmriruprrdiob`) will be replaced

---

## Need Help?

If you get stuck, just paste the connection string here and I'll do the rest for you!
