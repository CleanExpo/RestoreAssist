/**
 * OAuth Configuration Validator
 *
 * Validates Google OAuth Client ID configuration at runtime.
 * Provides clear error messages for common misconfigurations.
 *
 * @module utils/configValidator
 */

/**
 * Validation result for OAuth configuration
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * List of common placeholder values that indicate misconfiguration
 */
const PLACEHOLDER_VALUES = [
  'YOUR_CLIENT_ID_HERE',
  'your_google_client_id',
  'REPLACE_WITH_YOUR_CLIENT_ID',
  'xxx',
  'placeholder',
  'test',
  'example',
];

/**
 * Validates Google OAuth Client ID format
 *
 * Expected format: [numbers]-[alphanumeric].apps.googleusercontent.com
 * Example: 292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com
 *
 * @param clientId - The Google Client ID to validate
 * @returns true if format is valid, false otherwise
 */
export function isValidGoogleClientIdFormat(clientId: string | undefined): boolean {
  if (!clientId) return false;

  // Must end with .apps.googleusercontent.com
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    return false;
  }

  // Extract the ID part before .apps.googleusercontent.com
  const idPart = clientId.replace('.apps.googleusercontent.com', '');

  // Must contain a hyphen separating numeric ID from random suffix
  if (!idPart.includes('-')) {
    return false;
  }

  // Regex pattern: [numbers]-[alphanumeric lowercase]
  const pattern = /^\d+-[a-z0-9]+$/;
  return pattern.test(idPart);
}

/**
 * Checks if Client ID is a known placeholder value
 *
 * @param clientId - The Client ID to check
 * @returns true if it's a placeholder, false if it's likely a real ID
 */
export function isPlaceholderValue(clientId: string | undefined): boolean {
  if (!clientId) return true;

  const normalized = clientId.toLowerCase().trim();

  // Check against known placeholders
  return PLACEHOLDER_VALUES.some((placeholder) => normalized.includes(placeholder.toLowerCase()));
}

/**
 * Validates Google OAuth Client ID configuration
 *
 * Checks:
 * - Client ID is present
 * - Client ID is not a placeholder value
 * - Client ID matches Google's expected format
 *
 * @param clientId - The Google Client ID from environment variables
 * @returns Validation result with errors and warnings
 */
export function validateOAuthConfig(clientId: string | undefined): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Client ID is present
  if (!clientId || clientId.trim() === '') {
    errors.push(
      'Google Client ID is missing. Set VITE_GOOGLE_CLIENT_ID in your .env file. ' +
      'Get your Client ID from: https://console.cloud.google.com/apis/credentials'
    );
    return { isValid: false, errors, warnings };
  }

  // Check 2: Client ID is not a placeholder
  if (isPlaceholderValue(clientId)) {
    errors.push(
      'Google Client ID appears to be a placeholder. Replace "' + clientId + '" with your actual Client ID from Google Cloud Console. ' +
      'Format: [numbers]-[random].apps.googleusercontent.com'
    );
    return { isValid: false, errors, warnings };
  }

  // Check 3: Client ID format is valid
  if (!isValidGoogleClientIdFormat(clientId)) {
    errors.push(
      'Google Client ID has invalid format. Expected: [numbers]-[random].apps.googleusercontent.com. ' +
      'Got: "' + clientId.substring(0, 50) + (clientId.length > 50 ? '...' : '') + '". ' +
      'Verify your Client ID in Google Cloud Console.'
    );
    return { isValid: false, errors, warnings };
  }

  // Check 4: Client ID length seems reasonable
  if (clientId.length < 50) {
    warnings.push(
      'Google Client ID seems unusually short (' + clientId.length + ' chars). ' +
      'Typical Client IDs are 60-80 characters. Double-check in Google Cloud Console.'
    );
  }

  // All checks passed
  return {
    isValid: true,
    errors,
    warnings,
  };
}

/**
 * Gets the current OAuth Client ID from environment variables
 *
 * @returns The Client ID or undefined if not set
 */
export function getClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

/**
 * Validates the current OAuth configuration
 *
 * Convenience function that reads from environment and validates.
 *
 * @returns Validation result
 */
export function validateCurrentOAuthConfig(): ConfigValidationResult {
  const clientId = getClientId();
  return validateOAuthConfig(clientId);
}

/**
 * Formats validation errors for console logging
 *
 * @param result - Validation result
 * @returns Formatted string for console output
 */
export function formatValidationErrors(result: ConfigValidationResult): string {
  if (result.isValid) {
    return '✅ OAuth Configuration: Valid';
  }

  let output = '❌ OAuth Configuration: Invalid\n\n';

  if (result.errors.length > 0) {
    output += 'ERRORS:\n';
    result.errors.forEach((error, index) => {
      output += `  ${index + 1}. ${error}\n`;
    });
  }

  if (result.warnings.length > 0) {
    output += '\nWARNINGS:\n';
    result.warnings.forEach((warning, index) => {
      output += `  ${index + 1}. ${warning}\n`;
    });
  }

  output += '\nTroubleshooting: https://docs.restoreassist.com/troubleshooting/oauth-setup\n';

  return output;
}

export default {
  validateOAuthConfig,
  validateCurrentOAuthConfig,
  isValidGoogleClientIdFormat,
  isPlaceholderValue,
  getClientId,
  formatValidationErrors,
};
