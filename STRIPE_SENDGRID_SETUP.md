# Stripe + SendGrid Integration Setup

**Goal**: Automatically send emails to customers when Stripe payment events occur.

---

## 📧 Email Flow

When Stripe processes a payment, these emails are automatically sent:

| Stripe Event | Email Sent | Recipient |
|--------------|------------|-----------|
| **checkout.session.completed** | ✅ Subscription Confirmation | Customer |
| **invoice.payment_succeeded** | ✅ Payment Receipt | Customer |
| **invoice.payment_failed** | ⚠️ Payment Failed Notice | Customer |
| **customer.subscription.deleted** | 📭 Subscription Cancelled | Customer |

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Get SendGrid API Key

1. Go to https://app.sendgrid.com/settings/api_keys
2. Click **"Create API Key"**
3. Name: **"RestoreAssist Transactional"**
4. Permissions: **Mail Send** (or Full Access)
5. **Copy the API key** (starts with `SG.`)

---

### Step 2: Get Stripe Keys

#### A. Secret Key
1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy **"Secret key"** (starts with `sk_test_`)

#### B. Webhook Secret
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. Endpoint URL: `http://localhost:3001/api/stripe/webhook`
4. Events to send:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
5. **Copy "Signing secret"** (starts with `whsec_`)

---

### Step 3: Configure .env File

Edit `packages/backend/.env` and replace these placeholders:

```bash
# Line 38 - SendGrid API Key
SMTP_PASS=SG.paste_your_sendgrid_api_key_here

# Line 45 - Stripe Secret Key
STRIPE_SECRET_KEY=sk_test_paste_your_stripe_secret_key_here

# Line 46 - Stripe Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_paste_your_webhook_secret_here
```

**Example:**
```bash
SMTP_PASS=SG.abc123xyz789...
STRIPE_SECRET_KEY=sk_test_51A1B2C3...
STRIPE_WEBHOOK_SECRET=whsec_abc123xyz...
```

---

## ✅ Verify Sender Email (CRITICAL!)

**SendGrid will NOT send emails until you verify your sender address!**

### Option 1: Single Sender Verification (Quick - 2 minutes)

1. Go to https://app.sendgrid.com/settings/sender_auth/senders
2. Click **"Create New Sender"**
3. Fill in:
   - **From Name:** RestoreAssist
   - **From Email:** noreply@restoreassist.com *(must match EMAIL_FROM in .env)*
   - **Reply To:** support@restoreassist.com
   - **Company:** RestoreAssist
4. **Check your email** (noreply@restoreassist.com)
5. **Click verification link**

### Option 2: Domain Authentication (Production - 24-48 hours)

For production, authenticate your entire domain:

1. Go to https://app.sendgrid.com/settings/sender_auth
2. Click **"Authenticate Your Domain"**
3. Enter: `restoreassist.com`
4. Follow DNS setup instructions
5. Add CNAME records to your DNS provider (Cloudflare/Route53)
6. Wait 24-48 hours for verification

---

## 🧪 Test the Integration

### Start the Backend

```bash
cd packages/backend
npm run dev
```

**You should see:**
```
✅ Email service initialized: smtp
✅ Stripe payment verification enabled
🚀 RestoreAssist Backend running on http://localhost:3001
```

**If you see warnings:**
```
⚠️  SMTP credentials not configured
```
→ Check your .env file has the correct SendGrid API key

---

### Test Email Sending

#### Test 1: Simulate Checkout Completed

```bash
curl -X POST http://localhost:3001/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "id": "cs_test_123",
        "customer_email": "your.email@example.com",
        "amount_total": 2999,
        "currency": "aud",
        "subscription": "sub_test_123",
        "metadata": {
          "planName": "Professional"
        }
      }
    }
  }'
```

**Expected Result:**
```bash
# In server logs:
✅ Email sent to your.email@example.com: <message-id>

# In your inbox:
Subject: Welcome to RestoreAssist - Subscription Confirmed
From: RestoreAssist <noreply@restoreassist.com>
```

---

#### Test 2: Simulate Payment Success

```bash
curl -X POST http://localhost:3001/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "invoice.payment_succeeded",
    "data": {
      "object": {
        "id": "in_test_123",
        "customer_email": "your.email@example.com",
        "amount_paid": 2999,
        "currency": "aud",
        "subscription": "sub_test_123"
      }
    }
  }'
```

**Expected Email:**
```
Subject: Payment Received - $29.99 AUD
From: RestoreAssist <noreply@restoreassist.com>
```

---

## 📊 Monitor Email Delivery

### SendGrid Activity Dashboard

1. Go to https://app.sendgrid.com/email_activity
2. View recent emails
3. Check delivery status:
   - **Delivered** ✅ - Email reached inbox
   - **Processed** 🔄 - Sent to recipient's server
   - **Deferred** ⏳ - Temporary delay
   - **Bounced** ❌ - Invalid email address
   - **Dropped** ❌ - Sender not verified or spam detected

---

## 🔍 Troubleshooting

### Issue 1: "Sender email not verified"

**Error in logs:**
```
Error: The from email does not match a verified Sender Identity
```

**Fix:**
1. Go to https://app.sendgrid.com/settings/sender_auth/senders
2. Verify `noreply@restoreassist.com`
3. Check your email inbox for verification link

---

### Issue 2: "SMTP authentication failed"

**Error in logs:**
```
Error: 535 Authentication failed: Bad username / password
```

**Fix:**
- Ensure `SMTP_USER=apikey` (literally the word "apikey", not your email!)
- Ensure `SMTP_PASS=SG.your_actual_api_key` (the full API key)
- Check for extra spaces or quotes in .env

---

### Issue 3: No emails being sent

**Check:**

1. **Server logs show email service initialized:**
   ```
   ✅ Email service initialized: smtp
   ```

2. **SendGrid API key is valid:**
   - Go to https://app.sendgrid.com/settings/api_keys
   - Check the key exists and has "Mail Send" permission

3. **Webhook secret is configured:**
   ```bash
   echo $STRIPE_WEBHOOK_SECRET
   # Should show: whsec_...
   ```

4. **Sender is verified:**
   - https://app.sendgrid.com/settings/sender_auth/senders
   - Status should be "Verified"

---

### Issue 4: Emails going to spam

**Fixes:**

1. **Complete domain authentication** (not just single sender)
2. **Add SPF record to DNS:**
   ```
   v=spf1 include:sendgrid.net ~all
   ```
3. **Add DKIM records** (provided by SendGrid domain auth)
4. **Don't send from @gmail.com** - use your own domain
5. **Warm up your domain** - start with low volume

---

## 📋 Email Templates Included

RestoreAssist includes 4 pre-configured email templates:

### 1. Subscription Confirmation
**Trigger:** `checkout.session.completed`
**Template:** `packages/backend/src/services/emailService.ts` line 50

**Includes:**
- Welcome message
- Plan details
- Amount paid
- Subscription ID

---

### 2. Payment Receipt
**Trigger:** `invoice.payment_succeeded`
**Template:** Line 80

**Includes:**
- Payment confirmation
- Amount and currency
- Invoice ID
- Billing period

---

### 3. Payment Failed Notice
**Trigger:** `invoice.payment_failed`
**Template:** Line 110

**Includes:**
- Payment failure notice
- Retry instructions
- Support contact
- Update payment method link

---

### 4. Subscription Cancelled
**Trigger:** `customer.subscription.deleted`
**Template:** Line 140

**Includes:**
- Cancellation confirmation
- Feedback request
- Resubscribe option
- Data retention notice

---

## 🔐 Production Checklist

Before going live:

- [ ] ✅ Domain authentication complete (not just single sender)
- [ ] ✅ DKIM and SPF records added to DNS
- [ ] ✅ Use production Stripe keys (`sk_live_...`)
- [ ] ✅ Update webhook endpoint to production URL
- [ ] ✅ Change `EMAIL_FROM` to your verified domain
- [ ] ✅ Test all 4 email types
- [ ] ✅ Set up email alerts in SendGrid
- [ ] ✅ Configure Sentry for email error monitoring
- [ ] ✅ Review SendGrid pricing (upgrade from free if needed)

---

## 📈 SendGrid Free Tier

**Included:**
- 100 emails/day
- 3,000 emails/month
- Forever free!

**Perfect for:**
- Testing
- MVP launch
- Small user base

**Upgrade when needed:**
- 40,000/month: $19.95
- 100,000/month: $89.95

---

## 🎯 Next Steps

After setup is complete:

1. ✅ Test all 4 email types
2. ✅ Customize email templates (optional)
3. ✅ Set up domain authentication for production
4. ✅ Configure Stripe live mode
5. ✅ Monitor email analytics in SendGrid

---

## 📞 Support Resources

- **SendGrid Docs**: https://docs.sendgrid.com/
- **Stripe Webhooks**: https://stripe.com/docs/webhooks
- **RestoreAssist Docs**: See `packages/backend/EMAIL_SYSTEM_SETUP.md`

---

**Ready to test?** Follow the Quick Setup steps above, then restart your backend and trigger a test webhook!
