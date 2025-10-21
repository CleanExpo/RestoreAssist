# 🔴 Vercel Team Permission Issue - Quick Fix

**Issue**: Cannot deploy to `restore-assist-backend` project due to team permissions.

**Error**: `Git author CleanExpo@users.noreply.github.com must have access to the team Unite-Group on Vercel`

---

## ✅ QUICKEST FIX: Trigger Deployment from Vercel Dashboard

Since you've already configured the environment variables in the Vercel dashboard, the easiest solution is to trigger a deployment from there:

### Step-by-Step:

1. **Go to Vercel Dashboard**: https://vercel.com/unite-group/restore-assist-backend

2. **Check if project exists**:
   - If you see the project → Continue to step 3
   - If "Project not found" → See Option B below

3. **Go to Deployments tab**

4. **Click "Deploy" or "Redeploy"**
   - If there's a previous deployment, click the "..." menu → "Redeploy"
   - If no deployments exist, click "Deploy" and select the `main` branch

5. **Wait 2-5 minutes** for deployment to complete

6. **Verify**:
   ```bash
   curl https://restore-assist-backend.vercel.app/api/health
   ```
   Should return: `{"status":"healthy",...}`

---

## 🔧 Option B: Add Git User to Team (Permanent Fix)

If the restore-assist-backend project doesn't exist or you want CLI deployments to work:

1. **Go to Vercel Team Settings**: https://vercel.com/teams/unite-group/settings/members

2. **Invite Member**:
   - Email: CleanExpo@users.noreply.github.com
   - OR: Find the GitHub user "CleanExpo" and invite them

3. **Set Role**: Member or Owner

4. **Accept Invitation** (if sent to email)

5. **Redeploy**:
   ```bash
   cd packages/backend
   vercel --prod --yes
   ```

---

## 🔄 Option C: Connect GitHub Integration

If the restore-assist-backend project exists but has no deployments:

1. **Go to**: https://vercel.com/unite-group/restore-assist-backend/settings/git

2. **Connect Git Repository**:
   - Click "Connect Git Repository"
   - Select: CleanExpo/RestoreAssist
   - Root Directory: `packages/backend`
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Save** - Vercel will automatically deploy

4. **Check deployment status** in Deployments tab

---

## ⚡ Option D: Import from GitHub (If Project Doesn't Exist)

If restore-assist-backend project doesn't exist at all:

1. **Go to**: https://vercel.com/new

2. **Import Git Repository**:
   - Select: CleanExpo/RestoreAssist
   - Click "Import"

3. **Configure Project**:
   - **Project Name**: `restore-assist-backend`
   - **Root Directory**: `packages/backend`
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Add Environment Variables** (if not already done):
   ```env
   GOOGLE_CLIENT_ID=292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
   NODE_ENV=production
   ```

5. **Click "Deploy"**

6. **Wait for deployment** (2-5 minutes)

---

## 🎯 Recommended Approach

**If you already configured environment variables** → Use Option A (Dashboard Redeploy)

**If restore-assist-backend doesn't exist** → Use Option D (Import from GitHub)

**If you want CLI to work** → Use Option B (Add to team)

---

## 🧪 After Deployment - Test

Once deployed, verify everything works:

```bash
# 1. Test backend health
curl https://restore-assist-backend.vercel.app/api/health

# Expected: {"status":"healthy","timestamp":"...","environment":"production","uptime":...}

# 2. Test trial auth endpoint
curl https://restore-assist-backend.vercel.app/api/trial-auth/health

# Expected: {"status":"healthy",...}
```

Then test sign-in:
1. Go to: https://restoreassist.app
2. Click "Sign up with Google"
3. Complete OAuth
4. Should redirect to Dashboard ✅
5. Should see UserMenu avatar ✅

---

## 📋 Current Status

✅ Backend code is ready in GitHub (commit `00057e4`)
✅ Backend is built and ready to deploy
✅ Frontend is deployed and working
❌ Backend needs to be deployed to `restore-assist-backend.vercel.app`
❌ Team permission blocking CLI deployment

**Action Required**: Choose one of the options above to deploy the backend.

---

**Created**: October 21, 2025
**Priority**: HIGH - Blocking trial activation
**Estimated Time**: 5-10 minutes
