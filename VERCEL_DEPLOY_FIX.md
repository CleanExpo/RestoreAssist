# Fix Vercel Path Doubling Issue

**Error**: `The provided path "D:\RestoreAssist\packages\frontend\packages\frontend" does not exist`

**Cause**: Vercel project settings have "Root Directory" set to "packages/frontend", but you're running vercel command from inside that directory already, causing path doubling.

---

## Solution 1: Deploy from Repo Root (EASIEST)

```bash
# Go to repo root
cd D:\RestoreAssist

# Deploy frontend
vercel --prod --cwd packages/frontend
```

This tells Vercel to use `packages/frontend` as the working directory.

---

## Solution 2: Update Vercel Dashboard Settings

1. Go to: https://vercel.com/unite-group/restore-assist-frontend/settings
2. Click **General** tab
3. Find **Root Directory** setting
4. Change from: `packages/frontend`
5. Change to: `.` (current directory)
6. Click **Save**

Then deploy from frontend directory:
```bash
cd packages/frontend
vercel --prod
```

---

## Solution 3: Use Vercel Dashboard Deploy (RECOMMENDED)

Easiest option - let Vercel deploy via Git:

1. Push your changes to GitHub (already done ✅)
2. Go to Vercel Dashboard: https://vercel.com/unite-group/restore-assist-frontend
3. Click **Deployments** tab
4. Click **Redeploy** button on latest deployment
5. Select latest commit (110636a - CSP fix)
6. Click **Deploy**

Vercel will automatically pull from GitHub and deploy with correct settings.

---

## Recommended: Solution 3 (Git Deploy)

**Why?**
- No local CLI issues
- Deploys directly from GitHub
- Uses Git history
- Automatic on future pushes
- Most reliable

**Steps:**
1. ✅ Changes already pushed to GitHub (commit 110636a)
2. Go to: https://vercel.com/unite-group/restore-assist-frontend
3. Click "Redeploy" on latest deployment
4. Wait for build to complete
5. CSP fix will be live!

---

## After Deployment

Verify CSP fix worked:
1. Visit your deployed frontend URL
2. Open browser console (F12)
3. Try to sign up for trial
4. Should NOT see CSP error blocking API calls
5. Should see successful API calls to backend

---

## If You Want to Try CLI from Root

```bash
cd D:\RestoreAssist
vercel --prod --cwd packages/frontend
```

OR

```bash
cd D:\RestoreAssist
cd packages/frontend
vercel --prod
```

(Second approach may still fail if Root Directory is set in project settings)

---

**Quick Action**: Use Git deploy (Solution 3) - fastest and most reliable.

Go to: https://vercel.com/unite-group/restore-assist-frontend
Click: **Redeploy** on latest deployment
