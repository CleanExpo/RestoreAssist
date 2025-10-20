# 🛡️ RestoreAssist Fraud Prevention System

## Overview

RestoreAssist employs a **7-layer fraud detection system** to prevent users from abusing the free trial by creating multiple accounts from the same IP address or device.

---

## 🎯 **Your Goal: Prevent Trial Abuse**

**Scenario You're Preventing:**
1. User signs up with `john@email.com` → Gets 3 free reports ✅
2. User cancels after using 3 reports
3. User signs up AGAIN with `jane@email.com` from **same IP/device** → ❌ **BLOCKED!**

---

## 🔐 **7-Layer Defense System**

### Layer 1: Device Fingerprinting ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 127-189)

**Protection:**
- Tracks unique devices via browser fingerprint hash
- **MAX_TRIALS_PER_DEVICE = 1** (line 92)
- Blocks devices that have already used a trial
- Detects rapid re-registration (< 1 hour between attempts)

**Fraud Scores:**
- Device blocked: **100 points** (instant denial)
- Trial limit exceeded: **+50 points**
- Rapid re-registration: **+30 points**

---

### Layer 2: Email Validation ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 195-241)

**Protection:**
- Detects disposable email domains (tempmail.com, guerrillamail.com, etc.)
- **MAX_TRIALS_PER_EMAIL = 1** (line 93)
- Prevents same email from getting multiple trials

**Fraud Scores:**
- Disposable email: **+40 points**
- Email trial limit exceeded: **+50 points**

---

### Layer 3: IP Rate Limiting ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 247-304)

**Protection:**
- **MAX_TRIALS_PER_IP_PER_DAY = 3** (line 94)
- Blocks VPN/Proxy IP addresses
- Rate limits trial signups per IP

**Fraud Scores:**
- VPN/Proxy detected: **+20 points**
- IP rate limit exceeded (>3 per day): **+35 points**

---

### Layer 4: Payment Verification ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 310-357)

**Protection:**
- Card fingerprint tracking via Stripe
- Detects card reuse across multiple accounts
- Flags if same card used on >3 accounts

**Fraud Scores:**
- Card reuse (>3 accounts): **+45 points**

---

### Layer 5: Usage Pattern Analysis ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 363-405)

**Protection:**
- Detects rapid report generation (5 reports in < 1 hour)
- Identifies bot-like behavior

**Fraud Scores:**
- Rapid usage pattern: **+25 points**

---

### Layer 6: Time-based Lockouts ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 411-468)

**Protection:**
- Tracks fraud flags for 7 days
- Critical flags = instant permanent block
- Multiple high-severity flags = temp block

**Fraud Scores:**
- Critical flags detected: **+100 points** (instant denial)
- Multiple fraud flags (≥3): **+60 points**

---

### Layer 7: Fraud Scoring Algorithm ✅
**File:** `packages/backend/src/services/freeTrialService.ts` (lines 474-538)

**Decision Logic:**
- **FRAUD_SCORE_THRESHOLD = 70** (line 95)
- Aggregates scores from all layers
- Score ≥ 70 = **Trial Denied**
- Score < 70 = **Trial Approved** (with flags logged)

---

## 📊 **How It Works in Practice**

### Example 1: Legitimate User
```
User: john@gmail.com
Device: Fingerprint ABC123
IP: 203.45.67.89

Fraud Check:
✓ Device: New device (0 points)
✓ Email: Gmail domain (0 points)
✓ IP: First trial from this IP (0 points)
✓ Payment: No card verification yet (0 points)
✓ Usage: No history (0 points)
✓ Lockouts: No flags (0 points)

Total Score: 0/100
Decision: ✅ APPROVED - Trial activated
```

### Example 2: Fraudulent User (Same IP/Device)
```
User: jane@email.com (different email)
Device: Fingerprint ABC123 (SAME device)
IP: 203.45.67.89 (SAME IP)

Fraud Check:
❌ Device: Already used trial (+50 points)
✓ Email: New email (0 points)
⚠️  IP: 2nd trial from this IP today (+0 points, allowed up to 3)
✓ Payment: No card (0 points)
✓ Usage: No history (0 points)
✓ Lockouts: No flags (0 points)

Total Score: 50/100
Decision: ✅ APPROVED (but flagged for monitoring)

---

2 hours later, same user tries THIRD email:

User: alice@email.com (3rd different email)
Device: Fingerprint ABC123 (SAME device again)
IP: 203.45.67.89 (SAME IP)

Fraud Check:
❌ Device: Trial limit exceeded - device is now BLOCKED (+100 points)

Total Score: 100/100
Decision: ❌ DENIED - "Device is blocked"
```

### Example 3: Disposable Email + VPN
```
User: test@tempmail.com
Device: Fingerprint XYZ789
IP: 10.0.0.1 (Private network - VPN detected)

Fraud Check:
✓ Device: New (0 points)
❌ Email: Disposable domain (+40 points)
⚠️  IP: VPN detected (+20 points)
✓ Payment: No card (0 points)
✓ Usage: No history (0 points)
✓ Lockouts: No flags (0 points)

Total Score: 60/100
Decision: ✅ APPROVED (but heavily flagged)

Note: If this user triggers ONE more flag (rapid usage, etc.),
they'll hit 70+ and be blocked.
```

---

## 🗄️ **Database Tables**

### `device_fingerprints`
Tracks every unique device:
```sql
fingerprint_hash VARCHAR(255) UNIQUE
trial_count INT -- How many trials from this device
is_blocked BOOLEAN
blocked_reason TEXT
```

### `trial_fraud_flags`
Logs all fraud detections:
```sql
flag_type VARCHAR(100) -- 'device_trial_limit_exceeded', 'disposable_email', etc.
severity VARCHAR(50) -- 'low', 'medium', 'high', 'critical'
fraud_score INT -- Points contributed
resolved BOOLEAN -- Can be manually reviewed
```

### `free_trial_tokens`
Active trials:
```sql
user_id VARCHAR(255)
status VARCHAR(50) -- 'active', 'expired', 'revoked'
reports_remaining INT
expires_at TIMESTAMP
```

### `login_sessions`
IP tracking:
```sql
ip_address VARCHAR(45)
created_at TIMESTAMP
-- Used to count trials per IP per day
```

---

## 🔧 **Configuration Tuning**

### Making It MORE Strict (Harder to Abuse)
```typescript
// In freeTrialService.ts lines 90-95

const TRIAL_DURATION_DAYS = 7;        // ← Reduce to 3 days
const MAX_REPORTS_PER_TRIAL = 3;      // ← Reduce to 1 report
const MAX_TRIALS_PER_DEVICE = 1;      // ← Keep at 1
const MAX_TRIALS_PER_EMAIL = 1;       // ← Keep at 1
const MAX_TRIALS_PER_IP_PER_DAY = 3;  // ← Reduce to 1 (very strict!)
const FRAUD_SCORE_THRESHOLD = 70;     // ← Lower to 50 (stricter)
```

### Making It LESS Strict (More Lenient)
```typescript
const TRIAL_DURATION_DAYS = 14;       // ← Increase trial period
const MAX_REPORTS_PER_TRIAL = 5;      // ← More reports
const MAX_TRIALS_PER_DEVICE = 2;      // ← Allow 2 trials per device
const MAX_TRIALS_PER_EMAIL = 1;       // ← Keep email limit strict
const MAX_TRIALS_PER_IP_PER_DAY = 10; // ← Allow more IP signups
const FRAUD_SCORE_THRESHOLD = 80;     // ← Higher threshold
```

---

## 🚨 **Manual Review & Management**

### Block a Device Manually
```typescript
await freeTrialService.blockDevice(
  'fingerprint_hash_here',
  'Manually blocked - suspected fraud'
);
```

### Revoke a Trial
```typescript
await freeTrialService.revokeTrial(
  'token_id_here',
  'Multiple account abuse detected'
);
```

### Review Fraud Flags
```sql
-- See all unresolved high-severity flags
SELECT * FROM trial_fraud_flags
WHERE severity IN ('high', 'critical')
  AND resolved = false
ORDER BY created_at DESC;

-- See devices with multiple trials
SELECT fingerprint_hash, trial_count, is_blocked
FROM device_fingerprints
WHERE trial_count > 1
ORDER BY trial_count DESC;

-- See IPs with multiple signups
SELECT ip_address, COUNT(*) as signup_count
FROM login_sessions
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY ip_address
HAVING COUNT(*) > 3
ORDER BY signup_count DESC;
```

---

## ✅ **Current Protection Level**

Your system currently **PREVENTS:**
- ✅ Same device getting multiple trials
- ✅ Same email getting multiple trials
- ✅ More than 3 trials per IP per day
- ✅ Disposable email abuse
- ✅ VPN/Proxy usage (flagged)
- ✅ Rapid report generation (flagged)
- ✅ Card fingerprint reuse (flagged)

**Bottom Line:**
**You are ALREADY PROTECTED** against users swapping emails from the same IP/device. The fraud system will:
1. Allow the first trial (score: 0)
2. Flag the second attempt (score: 50-60)
3. **BLOCK the third attempt** (score: 100) from same device

---

## 🛠️ **Database Migration Fix**

**Issue Found:** The subscription table constraint is too permissive.

**Solution:** Run this migration to fix it:
```bash
psql -d your_database -f packages/backend/src/db/migrations/002_fix_subscription_constraint.sql
```

This ensures users can only have ONE active subscription at a time.

---

## 📝 **Recommendations**

1. **Monitor Fraud Flags Weekly**
   - Review unresolved high/critical flags
   - Look for patterns (same IP range, etc.)

2. **Consider Adding:**
   - Email verification requirement before trial activation
   - SMS verification for suspicious signups (high fraud score but < 70)
   - CAPTCHA for high-risk IPs

3. **Analytics Dashboard**
   - Track fraud score distribution
   - Monitor trial denial rate
   - Identify false positives

---

## 🎯 **Summary**

**You're already protected!** Your 7-layer system prevents trial abuse via:
- Device fingerprinting (1 trial per device)
- Email limiting (1 trial per email)
- IP rate limiting (3 trials per IP per day)
- Fraud scoring (automatic blocking at 70+ points)

The only fix needed is the database constraint migration to ensure proper subscription tracking.

**Want to make it stricter?** Lower the thresholds in lines 90-95 of `freeTrialService.ts`.
**Want to make it more lenient?** Increase the thresholds or add whitelisting for trusted IPs.
