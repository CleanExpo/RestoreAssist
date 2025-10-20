# Webhook Testing Guide - Simple Steps

## Your Webhook Configuration ✅

**Webhook Endpoint:** `https://restoreassist.app/api/stripe/webhook`
**Webhook Secret:** `whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa`

---

## Step 1: Add Webhook Secret to Vercel (IMPORTANT!)

Your webhook is configured in Stripe, but you need to tell your production app about it:

### Instructions:

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Click on your RestoreAssist project

2. **Add Environment Variable:**
   - Click **Settings** (top menu)
   - Click **Environment Variables** (left sidebar)
   - Click **Add New** button

3. **Enter the following:**
   ```
   Name: STRIPE_WEBHOOK_SECRET
   Value: whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa
   Environment: Production ✅ (check this box)
   ```

4. **Save and Redeploy:**
   - Click **Save**
   - Go to **Deployments** tab
   - Click the **︙** menu on the latest deployment
   - Click **Redeploy**

---

## Step 2: Delete Duplicate Webhook in Stripe

You have TWO webhooks pointing to the same URL. Let's delete one:

1. **Go to Stripe Webhooks:**
   - Visit: https://dashboard.stripe.com/webhooks

2. **You'll see TWO endpoints:**
   - ✅ **Keep this one:** "RestoreAssist Production Webhook" (18 events)
   - ❌ **Delete this one:** "energetic-jubilee-thin" (15 events)

3. **Delete the duplicate:**
   - Click on "energetic-jubilee-thin"
   - Scroll down and click **Delete endpoint**
   - Confirm deletion

---

## Step 3: Test Your Webhook

Once you've completed Steps 1 & 2, test it:

### Option A: Trigger a Test Event from Stripe (EASIEST!)

1. **Go to your webhook:**
   - Visit: https://dashboard.stripe.com/webhooks
   - Click on "RestoreAssist Production Webhook"

2. **Send a test event:**
   - Click the **"Send test webhook"** button (top right)
   - Select: `checkout.session.completed`
   - Click **Send test webhook**

3. **Check the result:**
   - Look for the event in the "Recent events" tab
   - Status should be: **✅ 200** (success)
   - If you see ❌ 400 or ❌ 500, there's an issue

### Option B: Complete a Real Test Checkout

1. **Visit your pricing page:**
   - Go to: https://restoreassist.app/pricing
   - (Or http://localhost:5173/pricing if testing locally)

2. **Start checkout:**
   - Click "Get Started" on any plan
   - Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: `12/25` (any future date)
   - CVC: `123` (any 3 digits)
   - Fill in email and address

3. **Complete payment:**
   - Click "Subscribe" or "Pay"
   - You should be redirected to the success page

4. **Verify webhook was received:**
   - Go to: https://dashboard.stripe.com/webhooks
   - Click on your webhook
   - Check "Recent events" tab
   - You should see the `checkout.session.completed` event with status **200**

---

## Step 4: Check Your Backend Logs

If the webhook was successful, your backend should show this in the logs:

1. **Go to Vercel:**
   - Visit your project
   - Click **Logs** (or **Functions**)

2. **Look for these messages:**
   ```
   Checkout session completed: cs_test_xxxxx
   ✅ Subscription created successfully
   ```

---

## Troubleshooting

### ❌ Webhook shows 400 or 500 error

**Problem:** Webhook secret mismatch or not configured

**Solution:**
1. Make sure you added `STRIPE_WEBHOOK_SECRET` to Vercel (Step 1)
2. Make sure you redeployed after adding the variable
3. Double-check the secret matches exactly: `whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa`

### ❌ Events not showing up

**Problem:** Webhook endpoint might not be reachable

**Solution:**
1. Check your app is deployed and running: visit https://restoreassist.app/api/health
2. It should return: `{"status":"healthy",...}`
3. If not, check your Vercel deployment status

### ❌ Getting duplicate events

**Problem:** You still have two webhooks configured

**Solution:**
- Follow Step 2 to delete the duplicate webhook

---

## Quick Checklist

- [ ] Webhook secret added to Vercel environment variables
- [ ] Vercel app redeployed after adding secret
- [ ] Duplicate webhook deleted in Stripe
- [ ] Test event sent from Stripe dashboard (shows 200 status)
- [ ] OR test checkout completed successfully
- [ ] Backend logs show "Subscription created successfully"

---

## What Happens When Webhook Works?

1. **User completes checkout** → Stripe processes payment
2. **Stripe sends webhook** → Your backend at `/api/stripe/webhook`
3. **Backend verifies webhook** → Using the secret key
4. **Backend creates subscription** → Saves to database
5. **User can now generate reports** → Within their plan limits

---

## Need Help?

If something isn't working:

1. **Check Stripe webhook logs:**
   - https://dashboard.stripe.com/webhooks
   - Click your webhook → Recent events
   - Look at the response body for errors

2. **Check Vercel logs:**
   - Your Vercel project → Logs
   - Look for errors around the time you tested

3. **Test locally first:**
   - Make sure backend is running: `npm run dev`
   - Visit http://localhost:3001/api/health
   - Should return `{"status":"healthy"}`

---

**Status:** Webhook configured, waiting for production deployment
**Last Updated:** October 20, 2025
