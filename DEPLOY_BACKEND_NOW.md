# 🚨 DEPLOY BACKEND TO VERCEL - IMMEDIATE ACTION

## ✅ FIXED ISSUES:

1. ✅ Created proper `vercel.json` in `packages/backend/`
2. ✅ Created serverless function entry point at `packages/backend/api/index.js`
3. ✅ Configured proper build settings

## 🚀 DEPLOY NOW - TWO OPTIONS:

---

## OPTION 1: Vercel Dashboard (RECOMMENDED - Bypasses git author issue)

### Quick Steps:

1. **Go to:** https://vercel.com/unite-group/restore-assist-backend

2. **Fix Root Directory:**
   - Click "Settings" → "General"
   - Find "Root Directory"
   - Change to: `packages/backend`
   - Click "Save"

3. **Set Environment Variables** (if not already set):
   - Settings → "Environment Variables"
   - Add all from your `.env`:
     - `DATABASE_URL`
     - `JWT_SECRET`
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
     - `STRIPE_SECRET_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173`

4. **Deploy:**
   - Go to "Deployments" tab
   - Click "Redeploy" on latest deployment
   - Wait 2-5 minutes

5. **Test:**
   ```bash
   curl https://backend-e03gm60ws-unite-group.vercel.app/api/health
   ```

---

## OPTION 2: Vercel CLI (May have git author error)

```bash
cd packages/backend
vercel --prod
```

**If you get git author error:** Use Option 1 (Dashboard) instead.

Or run the automated script:
```bash
cd packages/backend
./DEPLOY_NOW.sh    # Linux/Mac
# or
DEPLOY_NOW.bat     # Windows
```

---

## 📋 WHAT WAS FIXED:

### File 1: `packages/backend/vercel.json`
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "outputDirectory": "dist",
  "framework": null,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ]
}
```

### File 2: `packages/backend/api/index.js`
Serverless function that loads your Express app from `dist/index.js`

---

## ✅ VERIFICATION:

After deployment, test these endpoints:

1. **Health Check:**
   ```
   GET https://backend-e03gm60ws-unite-group.vercel.app/api/health
   ```
   Should return: `{"status":"ok",...}`

2. **CORS Test:**
   ```
   curl -H "Origin: https://your-frontend.com" \
        https://backend-e03gm60ws-unite-group.vercel.app/api/health
   ```
   Should include CORS headers

3. **Auth Endpoint:**
   ```
   POST https://backend-e03gm60ws-unite-group.vercel.app/api/auth/google-login
   ```

---

## 🔧 TROUBLESHOOTING:

### Error: "vercel.json should be in root directory"
✅ **FIXED** - Now in `packages/backend/vercel.json`

### Error: "Git author must have access to team"
🔨 **SOLUTION** - Use Vercel Dashboard (Option 1) instead of CLI

### Build fails
1. Check Vercel logs: Dashboard → Deployments → Click deployment → "Logs"
2. Ensure all dependencies in package.json are correct
3. Verify `npm run build` works locally

### Runtime errors
1. Check environment variables are set in Vercel
2. Verify `DATABASE_URL` is correct
3. Check Vercel function logs

---

## 📊 DEPLOYMENT STATUS:

- **Project:** restore-assist-backend
- **Team:** Unite-Group
- **URL:** https://backend-e03gm60ws-unite-group.vercel.app
- **Root Directory:** packages/backend (SET THIS IN VERCEL SETTINGS)

---

## ⏭️ AFTER DEPLOYMENT:

1. **Update Frontend:**
   ```env
   # packages/frontend/.env
   VITE_API_BASE_URL=https://backend-e03gm60ws-unite-group.vercel.app
   ```

2. **Test Frontend → Backend Connection:**
   - Open frontend in browser
   - Open DevTools console
   - Try logging in with Google
   - Should connect to production backend

3. **Monitor Logs:**
   - Vercel Dashboard → Deployments → Latest → "Logs"
   - Watch for errors

---

## 🆘 IF STILL STUCK:

1. Check this file: `D:\RestoreAssist\VERCEL_DEPLOY_GUIDE.md`
2. Use Vercel Dashboard method (most reliable)
3. Check that Root Directory is set to `packages/backend`
4. Verify all environment variables are set

---

## 📝 COMMIT STATUS:

These files are ready to commit:
- ✅ `packages/backend/vercel.json` (updated)
- ✅ `packages/backend/api/index.js` (updated)

Commit with:
```bash
git add packages/backend/vercel.json packages/backend/api/index.js
git commit -m "fix: Configure Vercel deployment for backend"
git push
```

---

**⚡ DEPLOY NOW USING OPTION 1 (DASHBOARD) ⚡**
