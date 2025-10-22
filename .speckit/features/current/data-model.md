# Data Model: OAuth Authentication Fix

**Feature:** fix-oauth-authentication
**Created:** 2025-01-22
**Schema Version:** 1.0

## Overview

This data model extends the existing RestoreAssist authentication schema with an `auth_attempts` table for monitoring and adds documentation for integration with the trial fraud detection system. **No changes to existing tables** (users, sessions, free_trial_tokens, device_fingerprints, trial_fraud_flags).

## Entity Relationship Diagram

```
┌─────────────────┐
│     users       │
│─────────────────│
│ user_id (PK)    │──┐
│ email           │  │
│ name            │  │  1:N
│ profile_picture │  │
│ role            │  │
│ created_at      │  │
│ updated_at      │  │
└─────────────────┘  │
                     │
        ┌────────────┴──────────────┬───────────────────┐
        │                           │                   │
        ▼                           ▼                   ▼
┌──────────────────┐    ┌─────────────────────┐   ┌──────────────────┐
│    sessions      │    │  free_trial_tokens  │   │  auth_attempts   │
│──────────────────│    │─────────────────────│   │──────────────────│
│ session_id (PK)  │    │ token_id (PK)       │   │ attempt_id (PK)  │
│ user_id (FK)     │    │ user_id (FK)        │   │ user_email       │
│ jwt_token        │    │ token_value         │   │ ip_address       │
│ refresh_token    │    │ used                │   │ user_agent       │
│ expires_at       │    │ expires_at          │   │ oauth_error      │
│ created_at       │    │ created_at          │   │ success          │
└──────────────────┘    └─────────────────────┘   │ attempted_at     │
                                                    └──────────────────┘
                             │
                             │ 1:N
                             ▼
                    ┌──────────────────────┐
                    │ device_fingerprints  │
                    │──────────────────────│
                    │ fingerprint_id (PK)  │
                    │ user_id (FK)         │
                    │ device_hash          │
                    │ trial_count          │
                    │ is_blocked           │
                    │ blocked_reason       │
                    │ created_at           │
                    └──────────────────────┘
```

## Tables

### 1. users (Existing - No Changes)

**Purpose:** Store user account information from Google OAuth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | VARCHAR(255) | PRIMARY KEY | Unique identifier (format: `user-<timestamp>-<random>`) |
| email | VARCHAR(255) | UNIQUE, NOT NULL | From Google OAuth profile |
| name | VARCHAR(255) | NOT NULL | Display name from Google |
| profile_picture | TEXT | NULLABLE | Google profile image URL |
| role | ENUM('user', 'admin') | NOT NULL, DEFAULT 'user' | Authorization level |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Account creation |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last profile update |

**Indexes:**
- `idx_users_email` ON (email) - Fast lookup during OAuth login
- `idx_users_created_at` ON (created_at) - Analytics queries

**Validation Rules:**
- email MUST match Google OAuth email format
- email MUST be lowercase
- name MUST be 1-255 characters
- profile_picture MUST be valid HTTPS URL or NULL

**State Transitions:**
```
New User (OAuth)
    ↓
Active (role: user)
    ↓ (if promoted)
Admin (role: admin)
```

### 2. sessions (Existing - No Changes)

**Purpose:** Track active user sessions with JWT tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| session_id | VARCHAR(255) | PRIMARY KEY | Unique session identifier |
| user_id | VARCHAR(255) | FOREIGN KEY → users.user_id, NOT NULL | Session owner |
| jwt_token | TEXT | NOT NULL | Hashed access token |
| refresh_token | TEXT | NOT NULL | Hashed refresh token |
| expires_at | TIMESTAMP | NOT NULL | Session expiration |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Session start |

**Indexes:**
- `idx_sessions_user_id` ON (user_id) - Find user's sessions
- `idx_sessions_expires_at` ON (expires_at) - Cleanup expired sessions

**Validation Rules:**
- JWT tokens MUST be hashed before storage (SHA-256)
- expires_at MUST be after created_at
- Refresh token MUST be rotated on each use

**Cleanup:**
- Cron job deletes sessions WHERE expires_at < NOW() (daily)

### 3. free_trial_tokens (Existing - No Changes)

**Purpose:** Track trial activation status per user (fraud detection).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| token_id | VARCHAR(255) | PRIMARY KEY | Unique token identifier |
| user_id | VARCHAR(255) | FOREIGN KEY → users.user_id, NOT NULL | Trial owner |
| token_value | VARCHAR(255) | UNIQUE, NOT NULL | Trial activation token |
| used | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether trial activated |
| expires_at | TIMESTAMP | NOT NULL | Trial expiration (14 days) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Trial grant time |

**Indexes:**
- `idx_trial_tokens_user_id` ON (user_id) - Check trial eligibility
- `idx_trial_tokens_used` ON (used) - Find active trials

**Business Rules:**
- MAX_TRIALS_PER_EMAIL = 1 (enforced by freeTrialService)
- Trial tokens expire 14 days after creation
- Once used = TRUE, cannot be reused

### 4. device_fingerprints (Existing - No Changes)

**Purpose:** Prevent trial abuse via device fingerprinting.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| fingerprint_id | VARCHAR(255) | PRIMARY KEY | Unique fingerprint ID |
| user_id | VARCHAR(255) | FOREIGN KEY → users.user_id, NULLABLE | Associated user (NULL before first trial) |
| device_hash | VARCHAR(255) | UNIQUE, NOT NULL | Hash of device characteristics |
| trial_count | INTEGER | NOT NULL, DEFAULT 0 | Trials from this device |
| is_blocked | BOOLEAN | NOT NULL, DEFAULT FALSE | Device blacklisted |
| blocked_reason | TEXT | NULLABLE | Why device was blocked |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | First seen |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last activity |

**Device Hash Composition:**
```javascript
device_hash = SHA256(
  ip_address +
  user_agent +
  canvas_fingerprint +
  webgl_fingerprint +
  timezone_offset +
  screen_resolution
)
```

**Business Rules:**
- MAX_TRIALS_PER_DEVICE = 1
- is_blocked = TRUE prevents all future trials from device
- Admin can manually unblock via override

### 5. trial_fraud_flags (Existing - No Changes)

**Purpose:** Record fraud detection decisions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| flag_id | VARCHAR(255) | PRIMARY KEY | Unique flag identifier |
| user_id | VARCHAR(255) | FOREIGN KEY → users.user_id, NULLABLE | Flagged user (NULL if before account creation) |
| email | VARCHAR(255) | NOT NULL | Email address flagged |
| fraud_score | INTEGER | NOT NULL | Calculated fraud score (0-100) |
| reason | TEXT | NOT NULL | Why flagged (JSON array of reasons) |
| blocked | BOOLEAN | NOT NULL | Whether trial was denied |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Detection time |

**Fraud Score Calculation:**
```
score = 0
if (trials_for_email >= MAX_TRIALS_PER_EMAIL): score += 40
if (trials_for_device >= MAX_TRIALS_PER_DEVICE): score += 30
if (suspicious_ip_pattern detected): score += 20
if (vpn_detected): score += 10

blocked = (score >= FRAUD_SCORE_THRESHOLD) // Currently 70
```

### 6. auth_attempts (NEW TABLE)

**Purpose:** Monitor authentication success/failure rates for observability.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| attempt_id | VARCHAR(255) | PRIMARY KEY | Unique attempt identifier |
| user_email | VARCHAR(255) | NULLABLE | Email if known (NULL before OAuth completes) |
| ip_address | VARCHAR(45) | NOT NULL | IPv4 or IPv6 address |
| user_agent | TEXT | NOT NULL | Browser user agent string |
| oauth_error_code | VARCHAR(100) | NULLABLE | Google OAuth error code (NULL if success) |
| oauth_error_message | TEXT | NULLABLE | Technical error message (for debugging) |
| success | BOOLEAN | NOT NULL | Whether authentication succeeded |
| retry_count | INTEGER | NOT NULL, DEFAULT 0 | Number of retries before this attempt |
| attempted_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Timestamp of attempt |

**Indexes:**
- `idx_auth_attempts_email` ON (user_email) - Track per-user failure rate
- `idx_auth_attempts_ip` ON (ip_address) - Detect brute force by IP
- `idx_auth_attempts_attempted_at` ON (attempted_at) - Time-series queries
- `idx_auth_attempts_success` ON (success) - Success rate metrics

**Validation Rules:**
- ip_address MUST be valid IPv4 or IPv6
- oauth_error_code MUST be from known Google OAuth error set (if not NULL)
- retry_count MUST be >= 0

**Retention Policy:**
- Keep auth attempts for 90 days
- Archive older records to cold storage
- Cron job: DELETE FROM auth_attempts WHERE attempted_at < NOW() - INTERVAL '90 days'

**Analytics Queries:**
```sql
-- Authentication success rate (last 24 hours)
SELECT
  (COUNT(*) FILTER (WHERE success = TRUE))::DECIMAL / COUNT(*) * 100 AS success_rate
FROM auth_attempts
WHERE attempted_at >= NOW() - INTERVAL '24 hours';

-- Top OAuth error codes (last 7 days)
SELECT
  oauth_error_code,
  COUNT(*) AS occurrences
FROM auth_attempts
WHERE success = FALSE
  AND attempted_at >= NOW() - INTERVAL '7 days'
GROUP BY oauth_error_code
ORDER BY occurrences DESC;

-- Suspicious IP addresses (>10 failures, 0 successes)
SELECT
  ip_address,
  COUNT(*) AS failed_attempts
FROM auth_attempts
WHERE success = FALSE
  AND attempted_at >= NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) >= 10;
```

## Prisma Schema (NEW TABLE ONLY)

```prisma
model AuthAttempt {
  attempt_id          String    @id @default(uuid()) @db.VarChar(255)
  user_email          String?   @db.VarChar(255)
  ip_address          String    @db.VarChar(45)
  user_agent          String    @db.Text
  oauth_error_code    String?   @db.VarChar(100)
  oauth_error_message String?   @db.Text
  success             Boolean   @default(false)
  retry_count         Int       @default(0)
  attempted_at        DateTime  @default(now())

  @@index([user_email])
  @@index([ip_address])
  @@index([attempted_at])
  @@index([success])
  @@map("auth_attempts")
}
```

## Migration Script

```sql
-- Create auth_attempts table
CREATE TABLE IF NOT EXISTS auth_attempts (
  attempt_id VARCHAR(255) PRIMARY KEY,
  user_email VARCHAR(255),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL,
  oauth_error_code VARCHAR(100),
  oauth_error_message TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_auth_attempts_email ON auth_attempts(user_email);
CREATE INDEX idx_auth_attempts_ip ON auth_attempts(ip_address);
CREATE INDEX idx_auth_attempts_attempted_at ON auth_attempts(attempted_at);
CREATE INDEX idx_auth_attempts_success ON auth_attempts(success);

-- Grant permissions (if using role-based access)
GRANT SELECT, INSERT ON auth_attempts TO restoreassist_app;
```

## Integration Points

### OAuth Flow Integration

```typescript
// On OAuth attempt
async function recordAuthAttempt(
  email: string | null,
  ipAddress: string,
  userAgent: string,
  success: boolean,
  error?: { code: string; message: string },
  retryCount: number = 0
): Promise<void> {
  await db.authAttempt.create({
    data: {
      attempt_id: generateAttemptId(),
      user_email: email,
      ip_address: ipAddress,
      user_agent: userAgent,
      success,
      oauth_error_code: error?.code,
      oauth_error_message: error?.message,
      retry_count: retryCount,
      attempted_at: new Date(),
    },
  });
}
```

### Fraud Detection Integration

```typescript
// Check trial eligibility
async function validateTrialEligibility(userId: string, email: string): Promise<{
  eligible: boolean;
  reason?: string;
  fraudScore: number;
}> {
  // Check email-based limit
  const emailTrials = await db.freeTrialToken.count({
    where: { user_id: userId, used: true },
  });

  // Check device-based limit
  const deviceHash = calculateDeviceHash(req);
  const deviceTrials = await db.deviceFingerprint.findUnique({
    where: { device_hash: deviceHash },
  });

  // Calculate fraud score
  let fraudScore = 0;
  if (emailTrials >= MAX_TRIALS_PER_EMAIL) fraudScore += 40;
  if (deviceTrials && deviceTrials.trial_count >= MAX_TRIALS_PER_DEVICE) fraudScore += 30;

  const eligible = fraudScore < FRAUD_SCORE_THRESHOLD;

  // Log decision
  if (!eligible) {
    await db.trialFraudFlag.create({
      data: {
        flag_id: generateFlagId(),
        user_id: userId,
        email,
        fraud_score: fraudScore,
        reason: JSON.stringify(['email_limit', 'device_limit']),
        blocked: true,
        created_at: new Date(),
      },
    });
  }

  return { eligible, fraudScore, reason: !eligible ? 'Trial limit reached' : undefined };
}
```

## Data Retention & Compliance

| Table | Retention Period | Rationale |
|-------|-----------------|-----------|
| users | Indefinite | Core business data |
| sessions | Until expiry + 7 days | Grace period for refresh |
| free_trial_tokens | 1 year | Fraud pattern analysis |
| device_fingerprints | 1 year | Device-based fraud detection |
| trial_fraud_flags | 2 years | Audit trail, compliance |
| auth_attempts | 90 days | Observability, then archive |

**Privacy Compliance (Australian Privacy Principles):**
- User email, name, profile_picture are personal information
- Users can request data deletion via support
- IP addresses in auth_attempts are pseudonymized after 30 days
- Device fingerprints do not store raw biometric data

---

**Schema Version:** 1.0
**Last Updated:** 2025-01-22
**Next:** Run migration script in development, test authentication flow
