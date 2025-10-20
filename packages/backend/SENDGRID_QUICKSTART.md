# SendGrid Quick Start Guide

## 1. Create SendGrid Account

1. Go to https://sendgrid.com/pricing/
2. Sign up for Free plan (100 emails/day free forever)
3. Verify your email address

## 2. Get API Key

1. Log in to SendGrid
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name it "RestoreAssist Production"
5. Choose **Full Access** or **Mail Send**
6. Click **Create & View**
7. **IMPORTANT:** Copy the API key now (shown once!)

## 3. Configure RestoreAssist

### For Local Development:

Add to `packages/backend/.env`:

```bash
# SendGrid SMTP Relay
EMAIL_PROVIDER=smtp
EMAIL_FROM="RestoreAssist" <noreply@restoreassist.com>

SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### For Vercel Production:

1. Go to your Vercel project
2. Settings → Environment Variables
3. Add these variables:

```
EMAIL_PROVIDER = smtp
EMAIL_FROM = "RestoreAssist" <noreply@restoreassist.com>
SMTP_HOST = smtp.sendgrid.net
SMTP_PORT = 587
SMTP_USER = apikey
SMTP_PASS = SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

4. Redeploy

## 4. Verify Sender Email (CRITICAL!)

SendGrid requires sender verification:

### Option A: Single Sender Verification (Quick)

1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Enter:
   - From Name: `RestoreAssist`
   - From Email: `noreply@restoreassist.com` (must match EMAIL_FROM)
   - Reply To: `support@restoreassist.com`
4. Check your email and click verification link

### Option B: Domain Authentication (Production)

1. Go to **Settings** → **Sender Authentication**
2. Click **Authenticate Your Domain**
3. Enter: `restoreassist.com`
4. Follow DNS setup instructions
5. Add DNS records to your domain (Cloudflare/Route53)
6. Wait 24-48 hours for verification

**IMPORTANT:** Emails will fail if sender not verified!

## 5. Test Email System

### Start backend:
```bash
cd packages/backend
npm run dev
```

### Test via curl:
```bash
# Trigger a test checkout email
curl -X POST http://localhost:3001/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "id": "cs_test_123",
        "customer_email": "your_email@example.com",
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

**Look for in logs:**
```
✅ Email service initialized: smtp
✅ Email sent to your_email@example.com: <message-id>
```

## 6. Monitor Delivery

### SendGrid Dashboard:

1. Go to **Activity**
2. View recent emails
3. Check delivery status

### Common Statuses:

- **Delivered** ✅ - Email reached inbox
- **Processed** 🔄 - Email sent to recipient's server
- **Deferred** ⏳ - Temporary delay (retry later)
- **Bounced** ❌ - Email address invalid
- **Dropped** ❌ - SendGrid blocked (spam/invalid)

## Troubleshooting

### "Sender email not verified"

**Error:** `The from email does not match a verified Sender Identity`

**Fix:** Complete sender verification (step 4 above)

### "Authentication failed"

**Error:** `535 Authentication failed`

**Fix:**
- Check SMTP_USER is exactly `apikey` (not your email!)
- Check SMTP_PASS is your actual API key

### Emails going to spam

**Fix:**
- Complete domain authentication
- Add SPF/DKIM records
- Send from verified domain (not @gmail.com)

### No emails being sent

**Check:**
1. Backend logs show "✅ Email service initialized"
2. Stripe webhooks are configured
3. Environment variables set correctly
4. API key has "Mail Send" permission

## Free Plan Limits

- **100 emails/day** (3,000/month)
- Perfect for testing
- Upgrade when needed:
  - 40,000/month: $19.95
  - 100,000/month: $89.95

## Next Steps

Once working:

1. ✅ Set up domain authentication (production)
2. ✅ Add SPF/DKIM DNS records
3. ✅ Monitor email analytics
4. ✅ Set up email alerts in Sentry
5. ✅ Test all 4 email types

## Support

- **SendGrid Docs**: https://docs.sendgrid.com/
- **API Status**: https://status.sendgrid.com/
- **Support**: https://support.sendgrid.com/

---

**Need help?** Check EMAIL_SYSTEM_SETUP.md for detailed documentation.
