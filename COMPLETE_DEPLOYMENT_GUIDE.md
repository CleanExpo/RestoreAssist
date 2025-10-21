# 🚀 Complete Deployment Fix - Step by Step

**Status**: Backend needs to be deployed to Vercel
**Blocking**: Trial activation, user sign-in, all backend functionality

---

## 🎯 The Problem

The backend code is ready in GitHub but **NOT deployed** to Vercel. The frontend is trying to reach:
```
https://restore-assist-backend.vercel.app
```

But this URL returns `404 NOT_FOUND` because the backend has never been deployed there.

---

## ✅ OPTION 1: Deploy via Vercel Dashboard (EASIEST - 5 minutes)

This is the fastest way to get the backend online:

### Step 1: Import Project to Vercel

1. **Go to**: https://vercel.com/new

2. **Click "Import Git Repository"**

3. **Select Repository**: CleanExpo/RestoreAssist

4. **Configure Project**:
   - **Project Name**: `restore-assist-backend` (EXACT - this determines the URL)
   - **Root Directory**: `packages/backend` (click "Edit" next to Root Directory)
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. **Add Environment Variables** (click "Environment Variables" section):
   ```env
   GOOGLE_CLIENT_ID=292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com
   JWT_SECRET=restoreassist-production-jwt-secret-change-in-dashboard-later
   ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
   NODE_ENV=production
   ```

6. **Click "Deploy"**

7. **Wait 2-5 minutes** for deployment to complete

8. **Verify URL**: Should be `https://restore-assist-backend.vercel.app`

### Step 2: Disable Deployment Protection

1. **Go to**: https://vercel.com/unite-group/restore-assist-backend/settings/deployment-protection

2. **Set to**: "Standard" (protects only preview deployments)

3. **Click "Save"**

### Step 3: Test Backend

```bash
curl https://restore-assist-backend.vercel.app/api/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T...",
  "environment": "production",
  "uptime": 123.456
}
```

**NOT**:
```html
<!doctype html>...Authentication Required...
```

---

## ✅ OPTION 2: Use GitHub Actions (Automated - 10 minutes setup)

I've created a GitHub Actions workflow that will auto-deploy on every push.

### Requirements:

You need to add these secrets to your GitHub repository:

1. **Go to**: https://github.com/CleanExpo/RestoreAssist/settings/secrets/actions

2. **Click "New repository secret"**

3. **Add these secrets**:

   **VERCEL_TOKEN**:
   - Get from: https://vercel.com/account/tokens
   - Click "Create Token"
   - Name: "GitHub Actions Backend Deploy"
   - Scope: Full Account
   - Copy the token

   **VERCEL_ORG_ID**:
   - Go to: https://vercel.com/unite-group/settings
   - Copy the "Team ID" (starts with `team_`)

   **VERCEL_PROJECT_ID**:
   - Go to: https://vercel.com/unite-group/restore-assist-backend/settings
   - Copy the "Project ID" (starts with `prj_`)
   - NOTE: You need to create the project first via Option 1 to get this ID

4. **Trigger Workflow**:
   - Go to: https://github.com/CleanExpo/RestoreAssist/actions
   - Click "Deploy Backend to Vercel"
   - Click "Run workflow"
   - Select branch: main
   - Click "Run workflow"

5. **Wait** for green checkmark (2-5 minutes)

6. **Verify** backend is live

---

## ✅ OPTION 3: Add Git User to Vercel Team (Permanent CLI Fix)

This allows CLI deployments to work:

1. **Go to**: https://vercel.com/teams/unite-group/settings/members

2. **Click "Invite Member"**

3. **Enter**: The email associated with the GitHub account "CleanExpo"

4. **Set Role**: Member or Owner

5. **Send Invitation**

6. **Accept Invitation** (check email)

7. **Then run** (I can run this for you):
   ```bash
   cd packages/backend
   vercel --prod --yes
   ```

---

## 🧪 Testing After Deployment

Once backend is deployed, test the full flow:

### 1. Backend Health Check
```bash
curl https://restore-assist-backend.vercel.app/api/health
```
Should return JSON with `"status": "healthy"`

### 2. Trial Auth Health Check
```bash
curl https://restore-assist-backend.vercel.app/api/trial-auth/health
```
Should return JSON with `"status": "healthy"`

### 3. Test Sign-In Flow

1. Open: https://restoreassist.app
2. Click: "Sign up with Google"
3. Complete Google OAuth
4. **Expected**: Redirected to Dashboard ✅
5. **Expected**: See UserMenu avatar in top-right ✅
6. **NOT Expected**: "Trial Activation Failed" ❌

### 4. Test UserMenu

1. On Dashboard, look for avatar in top-right
2. Click avatar
3. Should see dropdown menu with:
   - User name
   - User email
   - "Account Settings" link
   - "Sign Out" button

---

## 📊 Current Status Summary

| Item | Status | Action Required |
|------|--------|-----------------|
| Frontend Code | ✅ Complete | None |
| Backend Code | ✅ Complete | None |
| Frontend Deployed | ✅ Live | None |
| Backend Deployed | ❌ Missing | **YOU MUST DO THIS** |
| Environment Vars | ✅ Ready | Copy to Vercel |
| Authorization Fix | ✅ Complete | None |
| CORS Fix | ✅ Complete | None |
| UserMenu Component | ✅ Complete | None |

**BLOCKER**: Backend deployment (choose Option 1, 2, or 3 above)

---

## 🎯 Recommended Approach

**For fastest resolution**: Use **Option 1** (Vercel Dashboard Import)

**Why**:
- No CLI permission issues
- Visual interface - less error-prone
- Can verify each step
- Works immediately
- Takes 5-10 minutes total

**After successful deployment**:
- Backend will be at: `https://restore-assist-backend.vercel.app`
- Frontend will work immediately (already configured)
- Trial activation will work
- Users can sign in
- UserMenu will appear

---

## 📞 Next Steps

1. Choose one of the options above
2. Follow the steps exactly
3. Test the backend health endpoint
4. Test sign-in at https://restoreassist.app
5. Confirm UserMenu appears
6. Celebrate! 🎉

---

**Created**: October 21, 2025
**Priority**: CRITICAL
**Time Required**: 5-10 minutes
**Difficulty**: Easy (if following steps)
