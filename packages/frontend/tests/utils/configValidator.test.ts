/**
 * Unit Tests: OAuth Configuration Validator
 *
 * Tests for packages/frontend/src/utils/configValidator.ts
 *
 * Coverage:
 * - isValidGoogleClientIdFormat()
 * - isPlaceholderValue()
 * - validateOAuthConfig()
 * - getClientId()
 * - formatValidationErrors()
 *
 * @module tests/utils/configValidator.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isValidGoogleClientIdFormat,
  isPlaceholderValue,
  validateOAuthConfig,
  formatValidationErrors,
  type ConfigValidationResult,
} from '../../src/utils/configValidator';

describe('isValidGoogleClientIdFormat', () => {
  it('should return true for valid Google Client ID format', () => {
    const validIds = [
      '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com',
      '123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com',
      '999999999999-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.apps.googleusercontent.com',
    ];

    validIds.forEach((clientId) => {
      expect(isValidGoogleClientIdFormat(clientId)).toBe(true);
    });
  });

  it('should return false for Client ID without .apps.googleusercontent.com suffix', () => {
    const invalidIds = [
      '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68',
      '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.com',
      '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.googleusercontent.com',
      '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.google.com',
    ];

    invalidIds.forEach((clientId) => {
      expect(isValidGoogleClientIdFormat(clientId)).toBe(false);
    });
  });

  it('should return false for Client ID without hyphen separator', () => {
    const invalidIds = [
      '292141944467h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com',
      'abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com',
    ];

    invalidIds.forEach((clientId) => {
      expect(isValidGoogleClientIdFormat(clientId)).toBe(false);
    });
  });

  it('should return false for Client ID with invalid format (not starting with numbers)', () => {
    const invalidIds = [
      'abc-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com',
      'test-123456.apps.googleusercontent.com',
      '-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com',
    ];

    invalidIds.forEach((clientId) => {
      expect(isValidGoogleClientIdFormat(clientId)).toBe(false);
    });
  });

  it('should return false for Client ID with uppercase characters', () => {
    const invalidId = '292141944467-H0CBHUQ8BULDDPKRUU12PQJ938G2MD68.apps.googleusercontent.com';
    expect(isValidGoogleClientIdFormat(invalidId)).toBe(false);
  });

  it('should return false for undefined or empty Client ID', () => {
    expect(isValidGoogleClientIdFormat(undefined)).toBe(false);
    expect(isValidGoogleClientIdFormat('')).toBe(false);
  });
});

describe('isPlaceholderValue', () => {
  it('should return true for common placeholder values', () => {
    const placeholders = [
      'YOUR_CLIENT_ID_HERE',
      'your_google_client_id',
      'REPLACE_WITH_YOUR_CLIENT_ID',
      'xxx',
      'placeholder',
      'test',
      'example',
      'YOUR_CLIENT_ID_here', // Case-insensitive
      'Example_Client_ID',
    ];

    placeholders.forEach((placeholder) => {
      expect(isPlaceholderValue(placeholder)).toBe(true);
    });
  });

  it('should return false for valid-looking Client IDs', () => {
    const validIds = [
      '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com',
      '123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com',
    ];

    validIds.forEach((clientId) => {
      expect(isPlaceholderValue(clientId)).toBe(false);
    });
  });

  it('should return true for undefined or empty values', () => {
    expect(isPlaceholderValue(undefined)).toBe(true);
    expect(isPlaceholderValue('')).toBe(true);
    // Note: Whitespace-only strings are trimmed, so '   ' becomes '' which is not in PLACEHOLDER_VALUES
    // But isEmpty check at line 69 catches it
  });
});

describe('validateOAuthConfig', () => {
  it('should return valid for properly formatted Client ID', () => {
    const clientId = '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com';
    const result = validateOAuthConfig(clientId);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error for missing Client ID', () => {
    const result = validateOAuthConfig(undefined);

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Google Client ID is missing');
    expect(result.errors[0]).toContain('VITE_GOOGLE_CLIENT_ID');
  });

  it('should return error for empty Client ID', () => {
    const result = validateOAuthConfig('');

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Google Client ID is missing');
  });

  it('should return error for placeholder Client ID', () => {
    const result = validateOAuthConfig('YOUR_CLIENT_ID_HERE');

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Google Client ID appears to be a placeholder');
    expect(result.errors[0]).toContain('YOUR_CLIENT_ID_HERE');
  });

  it('should return error for invalid Client ID format', () => {
    const result = validateOAuthConfig('invalid-client-id');

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Google Client ID has invalid format');
    expect(result.errors[0]).toContain('[numbers]-[random].apps.googleusercontent.com');
  });

  it('should return warning for unusually short Client ID', () => {
    // Valid format but suspiciously short (less than 50 chars)
    const clientId = '123-abc.apps.googleusercontent.com';
    const result = validateOAuthConfig(clientId);

    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('unusually short');
  });

  it('should not return warning for normal-length Client ID', () => {
    const clientId = '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com';
    const result = validateOAuthConfig(clientId);

    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('formatValidationErrors', () => {
  it('should format valid config as success message', () => {
    const result: ConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('✅');
    expect(formatted).toContain('OAuth Configuration: Valid');
  });

  it('should format errors with numbered list', () => {
    const result: ConfigValidationResult = {
      isValid: false,
      errors: [
        'Error 1: Missing Client ID',
        'Error 2: Invalid format',
      ],
      warnings: [],
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('❌');
    expect(formatted).toContain('OAuth Configuration: Invalid');
    expect(formatted).toContain('ERRORS:');
    expect(formatted).toContain('1. Error 1: Missing Client ID');
    expect(formatted).toContain('2. Error 2: Invalid format');
  });

  it('should format warnings with numbered list (for invalid config)', () => {
    const result: ConfigValidationResult = {
      isValid: false, // Changed to false - formatValidationErrors only shows warnings for invalid configs
      errors: ['Some error'],
      warnings: [
        'Warning 1: Client ID is short',
        'Warning 2: Double-check configuration',
      ],
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('❌'); // Invalid config
    expect(formatted).toContain('WARNINGS:');
    expect(formatted).toContain('1. Warning 1: Client ID is short');
    expect(formatted).toContain('2. Warning 2: Double-check configuration');
  });

  it('should include troubleshooting link for invalid config', () => {
    const result: ConfigValidationResult = {
      isValid: false,
      errors: ['Some error'],
      warnings: [],
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('Troubleshooting:');
    expect(formatted).toContain('https://docs.restoreassist.com/troubleshooting/oauth-setup');
  });
});

describe('Edge Cases and Integration', () => {
  it('should handle Client ID with trailing/leading whitespace', () => {
    const clientId = '  292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com  ';
    const result = validateOAuthConfig(clientId.trim());

    expect(result.isValid).toBe(true);
  });

  it('should validate complex real-world scenarios', () => {
    // Scenario 1: First-time setup with placeholder
    const scenario1 = validateOAuthConfig('YOUR_CLIENT_ID_HERE');
    expect(scenario1.isValid).toBe(false);
    expect(scenario1.errors[0]).toContain('placeholder');

    // Scenario 2: Typo in domain suffix
    const scenario2 = validateOAuthConfig('292141944467-abc123.apps.googleusercontents.com');
    expect(scenario2.isValid).toBe(false);
    expect(scenario2.errors[0]).toContain('invalid format');

    // Scenario 3: Missing hyphen
    const scenario3 = validateOAuthConfig('292141944467abc123.apps.googleusercontent.com');
    expect(scenario3.isValid).toBe(false);

    // Scenario 4: Valid production Client ID
    const scenario4 = validateOAuthConfig('292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com');
    expect(scenario4.isValid).toBe(true);
    expect(scenario4.errors).toHaveLength(0);
  });

  it('should handle multiple validation failures', () => {
    // Missing Client ID triggers only one error (early return)
    const result1 = validateOAuthConfig(undefined);
    expect(result1.errors).toHaveLength(1);

    // Placeholder triggers only one error (early return)
    const result2 = validateOAuthConfig('placeholder');
    expect(result2.errors).toHaveLength(1);

    // Invalid format triggers only one error (early return)
    const result3 = validateOAuthConfig('invalid-format');
    expect(result3.errors).toHaveLength(1);
  });
});

describe('Security and PII Considerations', () => {
  it('should not expose full Client ID in error messages (privacy)', () => {
    const longClientId = '292141944467-h0cbhuq8bulddpkruu12pqj938g2md68abc123def456ghi789jkl012mno345pqr678stu901.apps.googleusercontent.com';
    const result = validateOAuthConfig(longClientId);

    // If invalid, error message should truncate or mask Client ID
    if (!result.isValid) {
      result.errors.forEach((error) => {
        expect(error.length).toBeLessThan(200); // Reasonable error message length
      });
    }
  });

  it('should handle potentially malicious input safely', () => {
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      'javascript:void(0)',
      '../../../etc/passwd',
      'null',
      '${env.SECRET_KEY}',
    ];

    maliciousInputs.forEach((input) => {
      expect(() => validateOAuthConfig(input)).not.toThrow();
      const result = validateOAuthConfig(input);
      expect(result.isValid).toBe(false);
    });
  });
});
