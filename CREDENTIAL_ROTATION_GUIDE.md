# 🔐 Automated Credential Rotation Guide

## Quick Start (Easiest Method)

**Double-click this file to start:**
```
D:\RestoreAssist\rotate-all-credentials.bat
```

The script will:
1. ✅ Open all necessary dashboards automatically
2. ✅ Prompt you to copy new credentials
3. ✅ Update your Claude config file automatically
4. ✅ Generate the new DATABASE_URL for Vercel
5. ✅ Save everything to a secure file

**Total time: 10-15 minutes**

---

## What Gets Rotated

| Credential | Current Status | Priority |
|------------|----------------|----------|
| GitHub Token | 🔴 EXPOSED | CRITICAL |
| Stripe Live Key | 🔴 EXPOSED | CRITICAL |
| Supabase Service Role | 🔴 EXPOSED | CRITICAL |
| Database Password | 🔴 EXPOSED | CRITICAL |

---

## Step-by-Step Instructions

### Step 1: GitHub Token (2 minutes)

1. Go to: https://github.com/settings/tokens
2. Find token ending in `2E2w3c`
3. Click **Delete**
4. Click **Generate new token (Classic)**
5. Name: `Claude Code - RestoreAssist`
6. Select scopes:
   - ✅ repo (all sub-items)
   - ✅ workflow
   - ✅ admin:org (read:org, write:org)
7. Click **Generate token**
8. **COPY THE TOKEN** (you'll only see it once!)

**Paste into script when prompted**

---

### Step 2: Stripe Live Key (3 minutes)

1. Go to: https://dashboard.stripe.com/apikeys
2. Find **Secret key** section (Live mode)
3. Click **Roll key**
4. Confirm: "Yes, roll this key"
5. Click **Reveal** on the new key
6. **COPY THE KEY**

**Paste into script when prompted**

---

### Step 3: Supabase Service Role Key (2 minutes)

1. Go to: https://supabase.com/dashboard/project/qwoggbbavikzhypzodcr/settings/api
2. Scroll to **Service role (secret)** section
3. Click **Reset** next to service_role key
4. Confirm reset
5. **COPY THE NEW KEY**

**Paste into script when prompted**

---

### Step 4: Database Password (2 minutes)

1. Go to: https://supabase.com/dashboard/project/qwoggbbavikzhypzodcr/settings/database
2. Scroll to **Database password** section
3. Click **Reset Database Password**
4. Confirm reset
5. **COPY THE PASSWORD** (shown only once!)

**Paste into script when prompted**

---

### Step 5: Update Vercel (3 minutes)

After the script completes, you'll have a file at:
```
C:\Users\Disaster Recovery 4\new-credentials-SECURE.txt
```

1. Go to: https://vercel.com/unite-group/restoreassist/settings/environment-variables
2. Find **DATABASE_URL**
3. Click **Edit**
4. **Paste the new DATABASE_URL** from the secure file
5. Save
6. Click **Redeploy** on latest deployment

---

### Step 6: Restart Claude Code (1 minute)

1. Close Claude Code completely
2. Wait 5 seconds
3. Open Claude Code
4. New credentials will be active

---

### Step 7: Cleanup (1 minute)

Delete the credentials file:
```
C:\Users\Disaster Recovery 4\new-credentials-SECURE.txt
```

**DO NOT commit this file to git!**

---

## Verification Checklist

After rotation, verify:

- [ ] Can login to GitHub (test with `git pull`)
- [ ] Can access Stripe dashboard (test at dashboard.stripe.com)
- [ ] Can access Supabase (test at supabase.com/dashboard)
- [ ] Production site works (test at https://restoreassist.app)
- [ ] Database connection works (test login on site)

---

## If Something Goes Wrong

### Issue: "Lost my new credentials"

**Solution**: Check the secure file:
```
C:\Users\Disaster Recovery 4\new-credentials-SECURE.txt
```

### Issue: "Vercel deployment failed"

**Solution**:
1. Check DATABASE_URL format is correct
2. Ensure no extra spaces
3. Try redeploying again

### Issue: "Can't access Supabase"

**Solution**:
1. Log into Supabase dashboard
2. Go to project settings → API
3. Regenerate service_role key again
4. Update Claude config manually

---

## Manual Config Update (If Script Fails)

Edit file: `C:\Users\Disaster Recovery 4\AppData\Roaming\Claude\claude_desktop_config.json`

Replace these lines:

**GitHub token (line 40):**
```json
"GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_NEW_GITHUB_TOKEN_HERE"
```

**Stripe key (line 143):**
```json
"--api-key", "YOUR_NEW_STRIPE_KEY_HERE"
```

**Supabase service role (line 116):**
```json
"SUPABASE_SERVICE_ROLE_KEY": "YOUR_NEW_SUPABASE_KEY_HERE"
```

**Database password (line 217):**
```json
"DATABASE_URL": "postgresql://postgres.qwoggbbavikzhypzodcr:YOUR_NEW_PASSWORD@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
```

---

## Security Best Practices Going Forward

1. ✅ Never commit credentials to git
2. ✅ Use environment variables for all secrets
3. ✅ Rotate credentials every 90 days
4. ✅ Use different credentials for dev/staging/prod
5. ✅ Enable 2FA on all accounts
6. ✅ Monitor access logs regularly

---

## Support

If you need help:
- Check SECURITY_INCIDENT_REPORT.md for full details
- Contact me (Claude) and I can help verify everything worked

**Created:** 2025-11-07
**Last Updated:** 2025-11-07
