/**
 * Environment Variable Validation Middleware
 *
 * Validates required environment variables at server startup.
 * Fails fast if critical configuration is missing or invalid.
 *
 * @module middleware/validateEnv
 */

interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Sanitizes secret values for logging
 * Shows first 8 characters only to prevent secret exposure
 *
 * @param secret - The secret value to sanitize
 * @returns Sanitized string showing only first 8 chars
 */
function sanitizeSecret(secret: string | undefined): string {
  if (!secret) return '[MISSING]';
  if (secret.length <= 8) return '[TOO_SHORT]';
  return `${secret.substring(0, 8)}...`;
}

/**
 * Validates Google OAuth Client ID format
 * Expected format: [numbers]-[random].apps.googleusercontent.com
 *
 * @param clientId - The Google Client ID to validate
 * @returns true if format is valid
 */
function isValidGoogleClientId(clientId: string | undefined): boolean {
  if (!clientId) return false;
  return clientId.endsWith('.apps.googleusercontent.com');
}

/**
 * Validates JWT secret strength
 * Secrets must be at least 32 characters for security
 *
 * @param secret - The JWT secret to validate
 * @returns true if secret meets minimum requirements
 */
function isValidJwtSecret(secret: string | undefined): boolean {
  if (!secret) return false;
  return secret.length >= 32;
}

/**
 * Validates all required environment variables
 *
 * Critical variables (server will not start if missing):
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - JWT_SECRET
 * - JWT_REFRESH_SECRET
 * - ANTHROPIC_API_KEY
 *
 * Optional but recommended:
 * - ALLOWED_ORIGINS
 * - SENTRY_DSN
 *
 * @returns Validation result with errors and warnings
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical: Google OAuth Configuration
  if (!process.env.GOOGLE_CLIENT_ID) {
    errors.push('GOOGLE_CLIENT_ID is required for OAuth authentication');
  } else if (!isValidGoogleClientId(process.env.GOOGLE_CLIENT_ID)) {
    errors.push(
      `GOOGLE_CLIENT_ID has invalid format. Expected: [numbers]-[random].apps.googleusercontent.com. ` +
      `Got: ${sanitizeSecret(process.env.GOOGLE_CLIENT_ID)}`
    );
  }

  if (!process.env.GOOGLE_CLIENT_SECRET) {
    errors.push('GOOGLE_CLIENT_SECRET is required for OAuth token exchange');
  } else if (process.env.GOOGLE_CLIENT_SECRET.length < 20) {
    errors.push(
      `GOOGLE_CLIENT_SECRET appears invalid (too short). ` +
      `Length: ${process.env.GOOGLE_CLIENT_SECRET.length} chars`
    );
  }

  // Critical: JWT Authentication
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required for session management');
  } else if (!isValidJwtSecret(process.env.JWT_SECRET)) {
    errors.push(
      `JWT_SECRET must be at least 32 characters. ` +
      `Current length: ${process.env.JWT_SECRET.length} chars`
    );
  }

  if (!process.env.JWT_REFRESH_SECRET) {
    errors.push('JWT_REFRESH_SECRET is required for token refresh');
  } else if (!isValidJwtSecret(process.env.JWT_REFRESH_SECRET)) {
    errors.push(
      `JWT_REFRESH_SECRET must be at least 32 characters. ` +
      `Current length: ${process.env.JWT_REFRESH_SECRET.length} chars`
    );
  }

  // Critical: JWT secrets must be different
  if (
    process.env.JWT_SECRET &&
    process.env.JWT_REFRESH_SECRET &&
    process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
  ) {
    errors.push(
      'JWT_SECRET and JWT_REFRESH_SECRET MUST be different for security. ' +
      'Generate using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }

  // Critical: Anthropic API Key (for report generation)
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required for AI-powered report generation');
  } else if (!process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
    errors.push(
      `ANTHROPIC_API_KEY has invalid format. Expected to start with 'sk-ant-'. ` +
      `Got: ${sanitizeSecret(process.env.ANTHROPIC_API_KEY)}`
    );
  }

  // Recommended: CORS Configuration
  if (!process.env.ALLOWED_ORIGINS) {
    warnings.push(
      'ALLOWED_ORIGINS not set. CORS will block requests from frontend. ' +
      'Set to: http://localhost:5173,http://localhost:3000'
    );
  }

  // Recommended: Error Monitoring
  if (!process.env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN not set. Error monitoring will be disabled in production.');
  }

  // Database Configuration
  if (process.env.USE_POSTGRES === 'true') {
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      errors.push('USE_POSTGRES=true but DATABASE_URL or DB_HOST not set');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Logs validation results with appropriate formatting
 * Errors are logged as console.error, warnings as console.warn
 *
 * @param result - The validation result to log
 */
export function logValidationResult(result: EnvValidationResult): void {
  if (result.valid) {
    console.log('✅ Environment validation passed');
    console.log('   GOOGLE_CLIENT_ID:', sanitizeSecret(process.env.GOOGLE_CLIENT_ID));
    console.log('   GOOGLE_CLIENT_SECRET:', sanitizeSecret(process.env.GOOGLE_CLIENT_SECRET));
    console.log('   JWT_SECRET:', sanitizeSecret(process.env.JWT_SECRET));
    console.log('   JWT_REFRESH_SECRET:', sanitizeSecret(process.env.JWT_REFRESH_SECRET));
    console.log('   ANTHROPIC_API_KEY:', sanitizeSecret(process.env.ANTHROPIC_API_KEY));
  } else {
    console.error('❌ Environment validation failed');
    console.error('\nERRORS:');
    result.errors.forEach((error, index) => {
      console.error(`   ${index + 1}. ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.warn('\n⚠️  WARNINGS:');
    result.warnings.forEach((warning, index) => {
      console.warn(`   ${index + 1}. ${warning}`);
    });
  }
}

/**
 * Validates environment and exits process if validation fails
 * Call this at server startup before initializing services
 *
 * @throws Process exits with code 1 if validation fails
 */
export function validateEnvironmentOrExit(): void {
  console.log('Validating environment configuration...');

  const result = validateEnvironment();
  logValidationResult(result);

  if (!result.valid) {
    console.error('\n💥 Server cannot start with invalid configuration');
    console.error('   Fix the errors above and restart the server\n');
    process.exit(1);
  }

  console.log('');
}

export default validateEnvironmentOrExit;
