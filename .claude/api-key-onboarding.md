# API Key Onboarding Flow Documentation

## Overview

RestoreAssist implements a **BYOK (Bring Your Own Key)** model where users provide their own Anthropic API key to power the AI report generation. This ensures users maintain full control over their AI usage, billing, and data processing while using our platform.

## User Journey

### Complete Flow: Signup → Onboarding → Dashboard

1. **New User Registration** (`/signup`)
   - User creates account with name, email, password
   - Upon successful registration, auto-signs in
   - **Always redirects to `/onboarding`** for API key setup

2. **Returning User Login** (`/login`)
   - User authenticates with credentials or Google OAuth
   - Checks onboarding status via `/api/user/onboarding-status`
   - Redirects to:
     - `/onboarding` if `hasCompletedOnboarding = false`
     - `/dashboard` if `hasCompletedOnboarding = true`

3. **Onboarding Page** (`/onboarding`)
   - Prompts user to enter Anthropic API key
   - Real-time validation (format check)
   - Saves encrypted key to database
   - Sets `hasCompletedOnboarding = true`
   - Redirects to `/dashboard`

4. **Dashboard Access**
   - Full platform access with AI capabilities enabled
   - API key used for report generation

## Security Implementation

### Encryption Architecture

**File:** `lib/crypto.ts`

- **Algorithm:** AES-256-GCM (Authenticated Encryption)
- **Key Derivation:** Uses `NEXTAUTH_SECRET` environment variable
- **Components:**
  - Random 16-byte IV (Initialization Vector) per encryption
  - Authentication tag for integrity verification
  - Scrypt key derivation for added security

```typescript
// Encryption format: "iv:authTag:encryptedData"
encrypt(apiKey) → "a1b2c3...:d4e5f6...:encrypted_key_data"
decrypt(encryptedString) → "sk-ant-api03-..."
```

### Security Features

- API keys never stored in plaintext
- Each encryption uses unique IV
- Authentication tag prevents tampering
- Encryption key derived from `NEXTAUTH_SECRET`
- Decryption failures handled gracefully

## Database Schema

**File:** `prisma/schema.prisma` (lines 53-54)

```prisma
model User {
  // ... other fields

  // API Configuration
  anthropicApiKey String? @db.Text // User's own Anthropic API key (encrypted)
  hasCompletedOnboarding Boolean @default(false) // Track if user completed API key setup
}
```

### Migration Instructions

When database is ready, apply schema changes:

```bash
# Generate Prisma migration
npx prisma migrate dev --name add-api-key-onboarding

# Apply to production
npx prisma migrate deploy
```

## API Endpoints

### POST /api/user/api-key
**Save encrypted API key**

```typescript
// Request
{
  "apiKey": "sk-ant-api03-..."
}

// Response (200)
{
  "success": true,
  "message": "API key saved successfully",
  "hasCompletedOnboarding": true
}

// Validation
- Checks format: must start with "sk-ant-"
- Minimum length: 20 characters
- Encrypts before storage
- Sets hasCompletedOnboarding = true
```

### GET /api/user/api-key
**Retrieve masked API key**

```typescript
// Response (200)
{
  "hasApiKey": true,
  "apiKey": "sk-ant-api...1234", // Masked: first 10 + last 4 chars
  "hasCompletedOnboarding": true
}

// Features
- Decrypts stored key
- Returns masked version for security
- Shows only first 10 and last 4 characters
```

### DELETE /api/user/api-key
**Remove API key**

```typescript
// Response (200)
{
  "success": true,
  "message": "API key removed successfully"
}

// Action
- Sets anthropicApiKey to null
- User must re-enter key to use AI features
```

### GET /api/user/onboarding-status
**Check onboarding completion**

```typescript
// Response (200)
{
  "hasCompletedOnboarding": true,
  "isAuthenticated": true
}

// Logic
- Returns true only if:
  - hasCompletedOnboarding flag is true AND
  - anthropicApiKey is not null
```

## Onboarding Page Features

**File:** `app/onboarding/page.tsx`

### Key Components

1. **Real-time Validation**
   - Debounced validation (500ms delay)
   - Format checking for "sk-ant-" prefix
   - Visual feedback (checkmark/error icons)

2. **Security Display**
   - Password field with show/hide toggle
   - Encryption notice
   - Security assurance messaging

3. **Help Section**
   - Step-by-step instructions
   - Direct link to Anthropic console
   - Visual guide for obtaining API key

4. **User Controls**
   - Save and continue button
   - "I'll add this later" skip option
   - Loading states during save

### Validation States

```typescript
validationStatus: 'idle' | 'valid' | 'invalid'

// Visual feedback
- idle: No indicator
- valid: Green checkmark + "Valid API key format"
- invalid: Red alert + "Invalid API key format"
```

## Auth Flow Integration

### Login Flow (`app/login/page.tsx`)

```typescript
// After successful authentication
1. Call /api/user/onboarding-status
2. If hasCompletedOnboarding:
   → Redirect to /dashboard
3. Else:
   → Redirect to /onboarding
```

### Signup Flow (`app/signup/page.tsx`)

```typescript
// After account creation
1. Auto-sign in user
2. Always redirect to /onboarding
   (New users need API key setup)
```

## Implementation Checklist

### Database Setup
- [ ] Run Prisma migration to add fields
- [ ] Verify encryption/decryption working
- [ ] Test with production database

### Environment Variables
- [ ] Ensure `NEXTAUTH_SECRET` is set (32+ chars)
- [ ] Verify same secret across environments

### Testing
- [ ] New user signup → onboarding flow
- [ ] Existing user without key → onboarding redirect
- [ ] API key save/retrieve/delete operations
- [ ] Encryption/decryption reliability
- [ ] Masking in GET endpoint

### Security Review
- [ ] API keys never logged in plaintext
- [ ] Encryption key properly secured
- [ ] Error handling doesn't leak sensitive data
- [ ] Session validation on all endpoints

## Error Handling

### Common Scenarios

1. **Invalid API Key Format**
   - User feedback: "Invalid API key format. Should start with 'sk-ant-'"
   - Prevents save until corrected

2. **Encryption Failure**
   - Logged server-side only
   - User sees generic error: "Failed to save API key"

3. **Missing NEXTAUTH_SECRET**
   - Warning logged at startup
   - Encryption will fail gracefully

4. **Database Connection Issues**
   - Standard 500 error responses
   - User prompted to retry

## Future Enhancements

1. **API Key Validation**
   - Test key with Anthropic API before saving
   - Show remaining credits/limits

2. **Multiple Keys**
   - Support for backup keys
   - Key rotation capabilities

3. **Usage Tracking**
   - Monitor API usage per user
   - Cost estimation features

4. **Team Accounts**
   - Shared organizational keys
   - Role-based key access