# Webhook Configuration Verification Checklist

## What You Need to Check

Follow this checklist to make sure everything is set up correctly.

---

## ✅ Check 1: Stripe Webhook URL

**Go to:** https://dashboard.stripe.com/webhooks

**Click on:** "RestoreAssist Production Webhook"

**Look at the top of the page - what URL do you see?**

It should show:
```
https://restore-assist-backend.vercel.app/api/stripe/webhook
```

**Is this correct?**
- [ ] Yes ✅ - It shows `restore-assist-backend.vercel.app`
- [ ] No ❌ - It still shows `restoreassist.app` (need to update it!)

---

## ✅ Check 2: Webhook Secret

**On the same Stripe webhook page, scroll down**

**You should see:**
```
Signing secret: whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa
```

**Is this the secret you see?**
- [ ] Yes ✅ - Matches exactly
- [ ] No ❌ - Different secret (tell me what you see)

---

## ✅ Check 3: Vercel Backend Environment Variable

**Go to:** https://vercel.com/unite-group/restore-assist-backend/settings/environment-variables

**Look for:** `STRIPE_WEBHOOK_SECRET`

**You should see:**
- Variable name: `STRIPE_WEBHOOK_SECRET`
- Value: `whsec_Jqc8...` (partially hidden for security)
- Environments: Production ✅, Preview ✅

**Is this variable there?**
- [ ] Yes ✅ - I can see it in the list
- [ ] No ❌ - Not there (need to add it!)

---

## ✅ Check 4: Backend Deployment Status

**Go to:** https://vercel.com/unite-group/restore-assist-backend

**Click on:** "Deployments" tab

**Look at the first deployment (most recent):**
- Status should be: "Ready" ✅ (green checkmark)
- Time should be: Recent (within last 10 minutes if you just redeployed)

**Did you redeploy AFTER adding the environment variable?**
- [ ] Yes ✅ - Redeployed after adding STRIPE_WEBHOOK_SECRET
- [ ] No ❌ - Haven't redeployed yet (need to do this!)

---

## ✅ Check 5: Test the Webhook

**Go to:** https://dashboard.stripe.com/webhooks

**Click on:** "RestoreAssist Production Webhook"

**Click:** "Send test webhook" button (top right)

**Select:** `checkout.session.completed`

**Click:** "Send test webhook"

**Look at the result - what status code do you see?**

**Expected results:**
- ✅ **200** = SUCCESS! Everything is working!
- ❌ **400** = Webhook secret mismatch or not found
- ❌ **404** = Webhook endpoint not found (wrong URL)
- ❌ **500** = Server error (backend has a problem)

**What did you get?**
- [ ] 200 ✅ - Success!
- [ ] 400 ❌ - Error (tell me the error message)
- [ ] 404 ❌ - Not found
- [ ] 500 ❌ - Server error
- [ ] Other ❌ - (tell me what you see)

---

## Summary: What Should Be True

For everything to work, ALL of these must be true:

1. ✅ Webhook URL = `https://restore-assist-backend.vercel.app/api/stripe/webhook`
2. ✅ Webhook secret = `whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa`
3. ✅ Vercel backend has `STRIPE_WEBHOOK_SECRET` environment variable
4. ✅ Backend was redeployed AFTER adding the variable
5. ✅ Test webhook returns status code 200

---

## If Something Is Wrong

### If webhook URL is still `restoreassist.app`:

**Fix:** Update it in Stripe
1. Go to webhook page
2. Click "..." (three dots)
3. Click "Update endpoint"
4. Change URL to: `https://restore-assist-backend.vercel.app/api/stripe/webhook`
5. Click "Update endpoint"

### If environment variable is missing:

**Fix:** Add it to Vercel
1. Go to: https://vercel.com/unite-group/restore-assist-backend/settings/environment-variables
2. Click "Add New"
3. Name: `STRIPE_WEBHOOK_SECRET`
4. Value: `whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa`
5. Check: Production ✅, Preview ✅
6. Click "Save"

### If you haven't redeployed:

**Fix:** Redeploy the backend
1. Go to: https://vercel.com/unite-group/restore-assist-backend
2. Click "Deployments" tab
3. Click "..." on latest deployment
4. Click "Redeploy"
5. Wait for "Ready" status

### If test returns 400/404/500:

**Tell me:**
- What status code you got
- What error message you see
- I'll help you fix it!

---

## After Checking Everything

Tell me your results like this:

**Example:**
```
Check 1: ✅ URL is correct
Check 2: ✅ Secret matches
Check 3: ✅ Variable is there
Check 4: ✅ Redeployed 5 minutes ago
Check 5: ✅ Test returned 200
```

Or if something failed:
```
Check 1: ❌ URL still shows restoreassist.app
Check 3: ❌ Variable not found
Check 5: ❌ Test returned 400 with error: "Invalid signature"
```

**Go through each check now and tell me the results!**
