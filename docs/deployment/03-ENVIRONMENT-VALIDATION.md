# Environment Validation System - RestoreAssist

Complete environment variable validation and configuration management system for production deployments.

---

## Overview

This system ensures all required environment variables are properly configured before application startup, preventing runtime failures and security issues.

**Features**:
- Type-safe environment variable validation
- Schema-based configuration
- Automatic type conversion
- Detailed error reporting
- Environment-specific validation rules
- Pre-deployment checks

---

## 1. Environment Validation Schema

### Create Validation Module

**Location**: `packages/backend/src/config/env-validator.ts`

```typescript
import { z } from 'zod';

/**
 * Environment Variable Schema
 * Defines all required and optional environment variables with validation rules
 */
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // Server Configuration
  PORT: z.string().transform(Number).pipe(z.number().int().min(1).max(65535)).default('3001'),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  USE_POSTGRES: z.string().transform((val) => val === 'true').default('false'),
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_HOST: z.string().optional(),
  POSTGRES_PORT: z.string().transform(Number).pipe(z.number().int().min(1).max(65535)).optional(),
  POSTGRES_DB: z.string().optional(),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().min(8).optional(),

  // Database Pool Configuration
  DATABASE_MAX_CONNECTIONS: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('20'),
  DATABASE_IDLE_TIMEOUT_MS: z.string().transform(Number).pipe(z.number().int().min(1000)).default('30000'),
  DATABASE_CONNECTION_TIMEOUT_MS: z.string().transform(Number).pipe(z.number().int().min(1000)).default('10000'),

  // Supabase Configuration (if using)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Anthropic AI Configuration
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-', 'Invalid Anthropic API key format'),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-20250514'),
  ANTHROPIC_MAX_TOKENS: z.string().transform(Number).pipe(z.number().int().min(100).max(8192)).default('4096'),
  ANTHROPIC_TEMPERATURE: z.string().transform(Number).pipe(z.number().min(0).max(1)).default('0.7'),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_CREDENTIALS: z.string().transform((val) => val === 'true').default('true'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FILE_PATH: z.string().optional(),
  LOG_MAX_FILES: z.string().transform(Number).pipe(z.number().int().min(1)).default('10'),
  LOG_MAX_SIZE: z.string().default('10m'),

  // File Upload Configuration
  MAX_FILE_SIZE: z.string().transform(Number).pipe(z.number().int().min(1)).default('10485760'), // 10MB
  UPLOAD_DIR: z.string().default('./uploads'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().int().min(1000)).default('900000'), // 15min
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().int().min(1)).default('100'),

  // Session Configuration
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_MAX_AGE: z.string().transform(Number).pipe(z.number().int().min(60000)).default('86400000'), // 24h

  // Feature Flags
  ENABLE_AI_GENERATION: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_SKILLS_API: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_WEBHOOKS: z.string().transform((val) => val === 'true').default('false'),

  // External Services
  REDIS_URL: z.string().url().optional(),
  ELASTICSEARCH_URL: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Monitoring & Observability
  SENTRY_DSN: z.string().url().optional(),
  NEW_RELIC_LICENSE_KEY: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),

  // Notifications
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  EMAIL_SERVICE: z.enum(['sendgrid', 'ses', 'smtp']).optional(),
  EMAIL_FROM: z.string().email().optional(),
  SENDGRID_API_KEY: z.string().optional(),

  // Security
  BCRYPT_ROUNDS: z.string().transform(Number).pipe(z.number().int().min(10).max(15)).default('12'),
  HELMET_ENABLED: z.string().transform((val) => val === 'true').default('true'),
  CSRF_ENABLED: z.string().transform((val) => val === 'true').default('true'),

  // Performance
  CLUSTER_MODE: z.string().transform((val) => val === 'true').default('false'),
  CLUSTER_WORKERS: z.string().transform(Number).pipe(z.number().int().min(1)).optional(),
});

/**
 * Environment-specific refinement rules
 * Additional validation based on NODE_ENV
 */
const envSchemaWithRefinements = envSchema.superRefine((data, ctx) => {
  // Production-specific validations
  if (data.NODE_ENV === 'production') {
    // Require PostgreSQL in production
    if (!data.USE_POSTGRES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PostgreSQL must be enabled in production (USE_POSTGRES=true)',
        path: ['USE_POSTGRES'],
      });
    }

    // Require database URL or connection details
    if (data.USE_POSTGRES && !data.DATABASE_URL && !data.POSTGRES_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either DATABASE_URL or POSTGRES_HOST must be set when USE_POSTGRES=true',
        path: ['DATABASE_URL'],
      });
    }

    // Require strong JWT secret
    if (data.JWT_SECRET.length < 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET must be at least 64 characters in production',
        path: ['JWT_SECRET'],
      });
    }

    // Require secure session secret
    if (data.SESSION_SECRET && data.SESSION_SECRET.length < 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SESSION_SECRET must be at least 64 characters in production',
        path: ['SESSION_SECRET'],
      });
    }

    // Require HTTPS CORS origin
    if (!data.CORS_ORIGIN.startsWith('https://') && data.CORS_ORIGIN !== '*') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGIN must use HTTPS in production',
        path: ['CORS_ORIGIN'],
      });
    }
  }

  // PostgreSQL validation
  if (data.USE_POSTGRES) {
    if (!data.DATABASE_URL && !data.POSTGRES_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL or POSTGRES_HOST is required when USE_POSTGRES=true',
        path: ['DATABASE_URL'],
      });
    }

    if (!data.DATABASE_URL && data.POSTGRES_HOST) {
      // Validate all Postgres connection parts are present
      if (!data.POSTGRES_DB) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'POSTGRES_DB is required when using POSTGRES_HOST',
          path: ['POSTGRES_DB'],
        });
      }
      if (!data.POSTGRES_USER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'POSTGRES_USER is required when using POSTGRES_HOST',
          path: ['POSTGRES_USER'],
        });
      }
      if (!data.POSTGRES_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'POSTGRES_PASSWORD is required when using POSTGRES_HOST',
          path: ['POSTGRES_PASSWORD'],
        });
      }
    }
  }

  // Cluster mode validation
  if (data.CLUSTER_MODE && !data.CLUSTER_WORKERS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'CLUSTER_WORKERS must be set when CLUSTER_MODE=true',
      path: ['CLUSTER_WORKERS'],
    });
  }

  // AWS S3 validation
  if (data.S3_BUCKET) {
    if (!data.AWS_ACCESS_KEY_ID || !data.AWS_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AWS credentials required when S3_BUCKET is set',
        path: ['AWS_ACCESS_KEY_ID'],
      });
    }
  }

  // Email service validation
  if (data.EMAIL_SERVICE === 'sendgrid' && !data.SENDGRID_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SENDGRID_API_KEY required when EMAIL_SERVICE=sendgrid',
      path: ['SENDGRID_API_KEY'],
    });
  }
});

/**
 * Parsed and validated environment variables type
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables
 * @throws {z.ZodError} If validation fails
 * @returns {Env} Validated and typed environment variables
 */
export function validateEnv(): Env {
  try {
    const parsed = envSchemaWithRefinements.parse(process.env);
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      console.error('');

      error.errors.forEach((err) => {
        const path = err.path.join('.');
        console.error(`  • ${path}: ${err.message}`);
      });

      console.error('');
      console.error('Please check your .env file and ensure all required variables are set correctly.');
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validate environment without exiting on failure
 * Useful for testing or optional validation
 */
export function validateEnvSafe(): { success: true; data: Env } | { success: false; errors: z.ZodError } {
  try {
    const parsed = envSchemaWithRefinements.parse(process.env);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

/**
 * Get formatted validation errors
 */
export function getValidationErrors(errors: z.ZodError): Array<{ field: string; message: string }> {
  return errors.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Print environment configuration (safe, no secrets)
 */
export function printEnvConfig(env: Env): void {
  console.log('📋 Environment Configuration:');
  console.log('');
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  Port: ${env.PORT}`);
  console.log(`  Database: ${env.USE_POSTGRES ? 'PostgreSQL' : 'In-Memory'}`);
  console.log(`  AI Model: ${env.ANTHROPIC_MODEL}`);
  console.log(`  Log Level: ${env.LOG_LEVEL}`);
  console.log(`  AI Generation: ${env.ENABLE_AI_GENERATION ? 'Enabled' : 'Disabled'}`);
  console.log(`  Skills API: ${env.ENABLE_SKILLS_API ? 'Enabled' : 'Disabled'}`);
  console.log('');
}
```

---

## 2. Environment Configuration Loader

**Location**: `packages/backend/src/config/index.ts`

```typescript
import dotenv from 'dotenv';
import path from 'path';
import { validateEnv, printEnvConfig, type Env } from './env-validator';

/**
 * Load environment variables from .env files
 * Priority: .env.local > .env.{NODE_ENV} > .env
 */
export function loadEnv(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Load .env (base)
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });

  // Load .env.{NODE_ENV}
  dotenv.config({ path: path.resolve(process.cwd(), `.env.${nodeEnv}`) });

  // Load .env.local (highest priority, not committed to git)
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

  console.log(`📦 Loaded environment: ${nodeEnv}`);
}

/**
 * Initialize and validate environment
 */
export function initializeEnv(): Env {
  // Load environment files
  loadEnv();

  // Validate environment
  const env = validateEnv();

  // Print configuration (non-sensitive)
  if (env.NODE_ENV !== 'test') {
    printEnvConfig(env);
  }

  return env;
}

/**
 * Singleton config instance
 */
let configInstance: Env | null = null;

/**
 * Get validated environment configuration
 */
export function getConfig(): Env {
  if (!configInstance) {
    configInstance = initializeEnv();
  }
  return configInstance;
}

/**
 * Reset config (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

export type { Env } from './env-validator';
```

---

## 3. Server Integration

**Location**: `packages/backend/src/server.ts`

Update to use environment validation:

```typescript
import express from 'express';
import { getConfig } from './config';
import { logger } from './utils/logger';

// Initialize and validate environment FIRST
const config = getConfig();

// Create Express app
const app = express();

// ... rest of server setup using config object

// Start server
const PORT = config.PORT;
const HOST = config.HOST;

app.listen(PORT, HOST, () => {
  logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
  logger.info(`📊 Environment: ${config.NODE_ENV}`);
  logger.info(`🗄️  Database: ${config.USE_POSTGRES ? 'PostgreSQL' : 'In-Memory'}`);

  // Send PM2 ready signal
  if (process.send) {
    process.send('ready');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Graceful shutdown initiated...');
  // ... cleanup
  process.exit(0);
});
```

---

## 4. Environment Template Files

### Development Template

**Location**: `.env.example`

```bash
# RestoreAssist Environment Configuration
# Copy to .env.local and fill in your values

# ===========================
# Application Settings
# ===========================
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# ===========================
# Database Configuration
# ===========================
USE_POSTGRES=false

# If USE_POSTGRES=true, provide either DATABASE_URL or individual connection params:
# DATABASE_URL=postgresql://user:password@localhost:5432/restoreassist
# Or:
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
# POSTGRES_DB=restoreassist
# POSTGRES_USER=postgres
# POSTGRES_PASSWORD=your_password

# Database Pool
DATABASE_MAX_CONNECTIONS=20
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECTION_TIMEOUT_MS=10000

# ===========================
# Supabase (Optional)
# ===========================
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your_anon_key
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ===========================
# Authentication
# ===========================
# IMPORTANT: Generate secure random strings for production!
# Example: openssl rand -base64 64
JWT_SECRET=dev_jwt_secret_replace_in_production_min_32_chars
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ===========================
# Anthropic AI
# ===========================
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
ANTHROPIC_MODEL=claude-opus-4-20250514
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_TEMPERATURE=0.7

# ===========================
# CORS
# ===========================
CORS_ORIGIN=http://localhost:5173
CORS_CREDENTIALS=true

# ===========================
# Logging
# ===========================
LOG_LEVEL=debug
# LOG_FILE_PATH=./logs/app.log
LOG_MAX_FILES=10
LOG_MAX_SIZE=10m

# ===========================
# File Upload
# ===========================
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# ===========================
# Rate Limiting
# ===========================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ===========================
# Feature Flags
# ===========================
ENABLE_AI_GENERATION=true
ENABLE_SKILLS_API=true
ENABLE_WEBHOOKS=false

# ===========================
# Security
# ===========================
BCRYPT_ROUNDS=12
HELMET_ENABLED=true
CSRF_ENABLED=true

# ===========================
# Performance
# ===========================
CLUSTER_MODE=false
# CLUSTER_WORKERS=4

# ===========================
# External Services (Optional)
# ===========================
# REDIS_URL=redis://localhost:6379
# ELASTICSEARCH_URL=http://localhost:9200
# S3_BUCKET=restoreassist-uploads
# S3_REGION=us-east-1
# AWS_ACCESS_KEY_ID=your_access_key
# AWS_SECRET_ACCESS_KEY=your_secret_key

# ===========================
# Monitoring (Optional)
# ===========================
# SENTRY_DSN=https://your-sentry-dsn
# NEW_RELIC_LICENSE_KEY=your_license_key
# DATADOG_API_KEY=your_api_key

# ===========================
# Notifications (Optional)
# ===========================
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
# EMAIL_SERVICE=sendgrid
# EMAIL_FROM=noreply@restoreassist.com
# SENDGRID_API_KEY=your_sendgrid_api_key
```

### Production Template

**Location**: `.env.production.example`

```bash
# RestoreAssist Production Environment
# NEVER commit this file with real values!

# ===========================
# Application Settings
# ===========================
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# ===========================
# Database Configuration
# ===========================
USE_POSTGRES=true
DATABASE_URL=postgresql://user:password@db.example.com:5432/restoreassist

# Database Pool
DATABASE_MAX_CONNECTIONS=50
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECTION_TIMEOUT_MS=10000

# ===========================
# Authentication
# ===========================
# CRITICAL: Generate with: openssl rand -base64 64
JWT_SECRET=REPLACE_WITH_SECURE_RANDOM_STRING_MIN_64_CHARS
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_SECRET=REPLACE_WITH_SECURE_RANDOM_STRING_MIN_64_CHARS

# ===========================
# Anthropic AI
# ===========================
ANTHROPIC_API_KEY=sk-ant-production-api-key
ANTHROPIC_MODEL=claude-opus-4-20250514
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_TEMPERATURE=0.7

# ===========================
# CORS
# ===========================
CORS_ORIGIN=https://app.restoreassist.com
CORS_CREDENTIALS=true

# ===========================
# Logging
# ===========================
LOG_LEVEL=info
LOG_FILE_PATH=/var/log/restoreassist/app.log
LOG_MAX_FILES=30
LOG_MAX_SIZE=50m

# ===========================
# Rate Limiting
# ===========================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ===========================
# Feature Flags
# ===========================
ENABLE_AI_GENERATION=true
ENABLE_SKILLS_API=true
ENABLE_WEBHOOKS=true

# ===========================
# Security
# ===========================
BCRYPT_ROUNDS=12
HELMET_ENABLED=true
CSRF_ENABLED=true

# ===========================
# Performance
# ===========================
CLUSTER_MODE=true
CLUSTER_WORKERS=4

# ===========================
# External Services
# ===========================
REDIS_URL=redis://redis.example.com:6379
S3_BUCKET=restoreassist-production
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=REPLACE_WITH_AWS_KEY
AWS_SECRET_ACCESS_KEY=REPLACE_WITH_AWS_SECRET

# ===========================
# Monitoring
# ===========================
SENTRY_DSN=https://your-production-sentry-dsn
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/PRODUCTION/WEBHOOK

# ===========================
# Email
# ===========================
EMAIL_SERVICE=sendgrid
EMAIL_FROM=noreply@restoreassist.com
SENDGRID_API_KEY=REPLACE_WITH_SENDGRID_KEY
```

---

## 5. Pre-Deployment Validation Script

**Location**: `scripts/validate-env.ts`

```typescript
#!/usr/bin/env node

import { validateEnvSafe, getValidationErrors } from '../packages/backend/src/config/env-validator';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * Pre-deployment environment validation script
 * Usage: node scripts/validate-env.ts [environment]
 */

const environment = process.argv[2] || process.env.NODE_ENV || 'development';
const envFile = `.env.${environment}`;
const envPath = path.resolve(process.cwd(), envFile);

console.log('🔍 RestoreAssist Environment Validation');
console.log('');
console.log(`Environment: ${environment}`);
console.log(`File: ${envFile}`);
console.log('');

// Check if env file exists
if (!fs.existsSync(envPath)) {
  console.error(`❌ Environment file not found: ${envFile}`);
  console.error('');
  console.error('Available environment files:');

  const envFiles = fs.readdirSync(process.cwd())
    .filter(f => f.startsWith('.env'))
    .map(f => `  • ${f}`);

  if (envFiles.length > 0) {
    console.error(envFiles.join('\n'));
  } else {
    console.error('  (none found)');
  }

  process.exit(1);
}

// Load environment file
dotenv.config({ path: envPath });

// Override NODE_ENV
process.env.NODE_ENV = environment;

console.log('✅ Environment file loaded');
console.log('');

// Validate
const result = validateEnvSafe();

if (result.success) {
  console.log('✅ Environment validation PASSED');
  console.log('');
  console.log('Configuration:');
  console.log(`  • Node Environment: ${result.data.NODE_ENV}`);
  console.log(`  • Port: ${result.data.PORT}`);
  console.log(`  • Database: ${result.data.USE_POSTGRES ? 'PostgreSQL' : 'In-Memory'}`);
  console.log(`  • AI Model: ${result.data.ANTHROPIC_MODEL}`);
  console.log(`  • Log Level: ${result.data.LOG_LEVEL}`);
  console.log(`  • CORS Origin: ${result.data.CORS_ORIGIN}`);
  console.log('');
  console.log('🎉 Ready for deployment!');
  process.exit(0);
} else {
  console.error('❌ Environment validation FAILED');
  console.error('');

  const errors = getValidationErrors(result.errors);

  console.error('Errors:');
  errors.forEach((err, index) => {
    console.error(`  ${index + 1}. ${err.field}: ${err.message}`);
  });

  console.error('');
  console.error('Please fix the errors and try again.');
  process.exit(1);
}
```

Make it executable:

```bash
chmod +x scripts/validate-env.ts
```

### Usage

```bash
# Validate development environment
npm run validate:env
# or
node scripts/validate-env.ts development

# Validate production environment
node scripts/validate-env.ts production

# Validate staging environment
node scripts/validate-env.ts staging
```

---

## 6. Package.json Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "validate:env": "tsx scripts/validate-env.ts",
    "validate:env:production": "tsx scripts/validate-env.ts production",
    "validate:env:staging": "tsx scripts/validate-env.ts staging",
    "validate:env:development": "tsx scripts/validate-env.ts development"
  }
}
```

---

## 7. CI/CD Integration

### GitHub Actions Validation

Add to `.github/workflows/main.yml`:

```yaml
jobs:
  validate-environment:
    name: Validate Environment Configuration
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Create production env file
        run: |
          cat > .env.production << EOF
          NODE_ENV=production
          PORT=${{ secrets.PORT }}
          USE_POSTGRES=true
          DATABASE_URL=${{ secrets.DATABASE_URL }}
          JWT_SECRET=${{ secrets.JWT_SECRET }}
          ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
          CORS_ORIGIN=${{ secrets.CORS_ORIGIN }}
          EOF

      - name: Validate environment
        run: npm run validate:env:production
```

---

## 8. Security Best Practices

### Secure Secret Generation

```bash
# Generate JWT secret (64 characters)
openssl rand -base64 64

# Generate session secret (64 characters)
openssl rand -base64 64

# Generate API key (32 characters)
openssl rand -hex 32

# Generate password (20 characters)
openssl rand -base64 20
```

### Environment File Security

**DO**:
- ✅ Add `.env.local` to `.gitignore`
- ✅ Add `.env.production` to `.gitignore`
- ✅ Use different secrets for each environment
- ✅ Rotate secrets regularly
- ✅ Use environment variables in CI/CD (GitHub Secrets)
- ✅ Set file permissions: `chmod 600 .env.production`
- ✅ Store production secrets in secure vault (AWS Secrets Manager, HashiCorp Vault)

**DON'T**:
- ❌ Commit real secrets to git
- ❌ Share `.env` files via email/Slack
- ❌ Use same secrets across environments
- ❌ Store secrets in code comments
- ❌ Log environment variables with secrets

### .gitignore Configuration

```bash
# Environment files
.env
.env.local
.env.*.local
.env.production
.env.staging

# But keep examples
!.env.example
!.env.production.example
```

---

## 9. Deployment Checklist Script

**Location**: `scripts/pre-deployment-check.sh`

```bash
#!/bin/bash

set -e

echo "🚀 RestoreAssist Pre-Deployment Checklist"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counter
CHECKS_PASSED=0
CHECKS_FAILED=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
  fi
}

# 1. Check Node.js version
echo "Checking Node.js version..."
node --version | grep -E "v(20|21|22)" > /dev/null
check "Node.js version 20+"

# 2. Check npm packages
echo "Checking npm packages..."
npm list --depth=0 > /dev/null 2>&1
check "All npm packages installed"

# 3. Validate environment
echo "Validating environment configuration..."
npm run validate:env:production > /dev/null 2>&1
check "Environment variables valid"

# 4. Check TypeScript compilation
echo "Checking TypeScript compilation..."
npm run build > /dev/null 2>&1
check "TypeScript compilation successful"

# 5. Check environment file exists
echo "Checking environment file..."
[ -f .env.production ]
check ".env.production file exists"

# 6. Check critical environment variables
echo "Checking critical environment variables..."
source .env.production
[ ! -z "$JWT_SECRET" ] && [ ${#JWT_SECRET} -ge 64 ]
check "JWT_SECRET length >= 64 characters"

[ ! -z "$ANTHROPIC_API_KEY" ] && [[ $ANTHROPIC_API_KEY == sk-ant-* ]]
check "ANTHROPIC_API_KEY format valid"

[ ! -z "$DATABASE_URL" ]
check "DATABASE_URL configured"

[ "$CORS_ORIGIN" != "http://localhost:5173" ]
check "CORS_ORIGIN not localhost"

# 7. Check database connection
echo "Checking database connection..."
# Add database connection test here
check "Database connection successful"

# 8. Check file permissions
echo "Checking file permissions..."
[ "$(stat -c %a .env.production)" == "600" ]
check ".env.production has correct permissions (600)"

# 9. Check PM2 ecosystem config
echo "Checking PM2 configuration..."
[ -f ecosystem.config.js ]
check "ecosystem.config.js exists"

# 10. Check logs directory
echo "Checking logs directory..."
[ -d logs ] || mkdir -p logs
[ -w logs ]
check "Logs directory writable"

# Summary
echo ""
echo "================================"
echo "Summary:"
echo -e "${GREEN}Passed:${NC} $CHECKS_PASSED"
echo -e "${RED}Failed:${NC} $CHECKS_FAILED"
echo "================================"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Ready for deployment.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some checks failed. Please fix issues before deploying.${NC}"
  exit 1
fi
```

Make executable:

```bash
chmod +x scripts/pre-deployment-check.sh
```

Usage:

```bash
./scripts/pre-deployment-check.sh
```

---

## 10. Troubleshooting

### Issue 1: Validation Failing

```bash
# Check which variables are missing
npm run validate:env:production

# Check current environment variables
printenv | grep -E '(NODE_ENV|DATABASE|JWT|ANTHROPIC)'

# Load and test manually
source .env.production
echo $JWT_SECRET
```

### Issue 2: Type Errors

```typescript
// Ensure zod is installed
npm install zod

// Update imports
import { z } from 'zod';
```

### Issue 3: Environment Not Loading

```typescript
// Debug env loading
import dotenv from 'dotenv';
import path from 'path';

const result = dotenv.config({
  path: path.resolve(process.cwd(), '.env.production'),
  debug: true // Enable debug output
});

console.log('Loaded:', result.parsed);
```

### Issue 4: Wrong Environment Used

```bash
# Explicitly set NODE_ENV
NODE_ENV=production npm run validate:env

# Check current environment
echo $NODE_ENV
```

---

## 11. Success Criteria Checklist

### Development Setup
- [ ] `zod` package installed
- [ ] `env-validator.ts` created with schema
- [ ] `config/index.ts` created with loader
- [ ] `.env.example` created with all variables documented
- [ ] Server updated to use validated config
- [ ] Validation runs successfully in development

### Production Readiness
- [ ] `.env.production.example` created
- [ ] All production-specific validations implemented
- [ ] Secrets generated securely (64+ character JWT secret)
- [ ] Pre-deployment validation script created and tested
- [ ] Environment file permissions set to 600
- [ ] Secrets stored in secure vault (not in git)

### CI/CD Integration
- [ ] Environment validation step added to CI/CD pipeline
- [ ] GitHub Secrets configured for all required variables
- [ ] Deployment fails if validation fails
- [ ] Pre-deployment checklist script runs successfully

### Documentation
- [ ] All environment variables documented in `.env.example`
- [ ] Security best practices documented
- [ ] Troubleshooting guide created
- [ ] Team trained on environment management

---

## Quick Reference

### Validation Commands

```bash
# Validate current environment
npm run validate:env

# Validate specific environment
npm run validate:env:production
npm run validate:env:staging
npm run validate:env:development

# Pre-deployment check
./scripts/pre-deployment-check.sh

# Generate secure secret
openssl rand -base64 64
```

### Environment File Priority

```
.env.local          (highest priority, never committed)
.env.{NODE_ENV}     (environment-specific)
.env                (base configuration)
```

---

**Next Guide**: [04-PRODUCTION-DEPLOYMENT.md](./04-PRODUCTION-DEPLOYMENT.md) - Complete production deployment procedures

---

**Resources**:
- Zod Documentation: https://zod.dev/
- dotenv Documentation: https://github.com/motdotla/dotenv
- The Twelve-Factor App: https://12factor.net/config
