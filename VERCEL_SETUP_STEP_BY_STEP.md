# Vercel Setup - Step by Step Guide

## What You Need to Do

You have TWO Vercel projects. We need to configure them correctly.

---

## Part 1: Check Your Domains (5 minutes)

### Step 1: Check Backend Domain

**1. Open this link:**
https://vercel.com/unite-group/restore-assist-backend

**2. Click the "Domains" tab** (near the top of the page)

**3. Write down ALL domains you see**

Example of what you might see:
```
restore-assist-backend.vercel.app (Production)
restoreassist.app (Production)
api.restoreassist.app (Production)
```

**Write them here:** restore-assist-backend.vercel.app

---

### Step 2: Check Frontend Domain

**1. Open this link:**
https://vercel.com/unite-group/restore-assist-frontend

**2. Click the "Domains" tab**

**3. Write down ALL domains you see**

Example:
```
restore-assist-frontend.vercel.app (Production)
restoreassist.app (Production)
www.restoreassist.app (Production)
```

**Write them here:** restoreassist.app &  restore-assist-frontend.vercel.app
---

## Part 2: Determine Your Webhook URL

Based on what you found above, tell me:

**Which project has `restoreassist.app` as a domain?**

- [ ] Backend has `restoreassist.app`
- [X] Frontend has `restoreassist.app` ✅ THIS IS YOUR SITUATION
- [ ] Neither has `restoreassist.app`
- [ ] Both have `restoreassist.app` (this would be a problem!)

### If Backend has `restoreassist.app`:
✅ Your webhook URL is CORRECT: `https://restoreassist.app/api/stripe/webhook`
➡️ Continue to Part 3

### If Frontend has `restoreassist.app`:
❌ Your webhook URL is WRONG - it's pointing to the frontend!
✅ Correct webhook URL should be: `https://restore-assist-backend.vercel.app/api/stripe/webhook`
➡️ You MUST update the Stripe webhook URL in Part 5

**YOUR SITUATION:**
- Backend is at: `restore-assist-backend.vercel.app`
- Frontend is at: `restoreassist.app`
- Current webhook points to: `restoreassist.app` ❌ (frontend - won't work!)
- Need to change webhook to: `restore-assist-backend.vercel.app` ✅ (backend - will work!)

### If Neither has it:
❌ Domain not connected yet
✅ Use: `https://restore-assist-backend.vercel.app/api/stripe/webhook`
➡️ You need to update Stripe webhook

---

## Part 3: Add Webhook Secret to Backend

**IMPORTANT: This goes to the BACKEND project ONLY!**

### Step 1: Open Backend Settings

**1. Click this link:**
https://vercel.com/unite-group/restore-assist-backend/settings/environment-variables

**2. You should see a page titled "Environment Variables"**

### Step 2: Add the Webhook Secret

**3. Click the "Add New" button** (usually top-right)

**4. You'll see a form with fields. Fill them in EXACTLY like this:**

```
Field 1 (Name): STRIPE_WEBHOOK_SECRET

Field 2 (Value): whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa

Field 3 (Environments):
✅ Check "Production"
✅ Check "Preview"
⬜ Leave "Development" UNCHECKED
```

**5. Click "Save"**

You should see a green checkmark ✅ saying "Environment variable created"

---

## Part 4: Redeploy Backend

**1. Click this link:**
https://vercel.com/unite-group/restore-assist-backend

**2. Click the "Deployments" tab** (near the top)

**3. Find the FIRST deployment in the list** (the most recent one)

**4. On the right side of that deployment, click the "︙" (three dots)**

**5. Click "Redeploy"**

**6. A popup appears - click "Redeploy" again to confirm**

**7. Wait 1-2 minutes** - you'll see "Building..." then "Ready"

---

## Part 5: Update Stripe Webhook URL ⚠️ IMPORTANT - YOU MUST DO THIS!

**Your webhook is currently pointing to the WRONG place (frontend instead of backend)**

### Follow these steps exactly:

**1. Go to Stripe webhooks:**
https://dashboard.stripe.com/webhooks

**2. Click on "RestoreAssist Production Webhook"**

**3. Click "..." (three vertical dots) in the top right corner**

**4. Click "Update endpoint"**

**5. Change the Endpoint URL:**

Current (WRONG): `https://restoreassist.app/api/stripe/webhook`

Change to (CORRECT): `https://restore-assist-backend.vercel.app/api/stripe/webhook`

**6. Scroll down and click "Update endpoint"**

**7. Verify it changed:**
- You should now see the new URL at the top
- It should say: `https://restore-assist-backend.vercel.app/api/stripe/webhook`

---

## Part 6: Test the Webhook

### Option 1: Send Test Event (EASIEST)

**1. Go to:**
https://dashboard.stripe.com/webhooks

**2. Click "RestoreAssist Production Webhook"**

**3. Click "Send test webhook" button** (top right)

**4. Select:** `checkout.session.completed`

**5. Click "Send test webhook"**

**6. Look at the result:**
- ✅ Green checkmark with "200" = SUCCESS!
- ❌ Red X with "400" or "500" = Problem (tell me the error)

---

## Verification Checklist

Before you say "done", verify:

- [ ] I checked both Backend and Frontend domains
- [ ] I added `STRIPE_WEBHOOK_SECRET` to **restore-assist-backend** (NOT frontend!)
- [ ] I redeployed the backend
- [ ] I updated the webhook URL in Stripe (if needed)
- [ ] I sent a test webhook and got status 200

---

## Common Mistakes to Avoid

❌ **Adding the secret to the FRONTEND** - It goes to BACKEND!
❌ **Not redeploying** - Changes don't apply until you redeploy
❌ **Wrong webhook URL** - Must point to backend, not frontend
❌ **Skipping the test** - Always test to make sure it works!

---

## What to Tell Me When Done

Once you've completed all steps, tell me:

1. **What domains does your backend have?**
   Example: "Backend has restoreassist.app and restore-assist-backend.vercel.app"

2. **Did you add the webhook secret?**
   Example: "Yes, added to backend"

3. **Did you redeploy?**
   Example: "Yes, redeployed backend"

4. **What was the test webhook result?**
   Example: "Got 200 success" OR "Got 400 error: [error message]"

---

**Take your time and follow each step carefully. I'll be here to help if you get stuck!**
