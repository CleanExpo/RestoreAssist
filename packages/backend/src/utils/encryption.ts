import crypto from 'crypto';

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size
const KEY_LENGTH = 32; // 256 bits

// ============================================================================
// Error Classes
// ============================================================================

export class EncryptionKeyError extends Error {
  constructor(message: string = 'Invalid or missing encryption key') {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string = 'Failed to decrypt data') {
    super(message);
    this.name = 'DecryptionError';
  }
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Validate encryption key from environment
 * @returns {boolean} True if key is valid
 * @throws {EncryptionKeyError} If key is invalid or missing
 */
export function validateEncryptionKey(): boolean {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new EncryptionKeyError('ENCRYPTION_KEY environment variable is not set');
  }

  // Decode base64 key
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(key, 'base64');
  } catch (error) {
    throw new EncryptionKeyError('ENCRYPTION_KEY must be base64 encoded');
  }

  // Validate key length (must be 32 bytes for AES-256)
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new EncryptionKeyError(
      `ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars or ${Math.ceil((KEY_LENGTH * 4) / 3)} base64 chars). Current length: ${keyBuffer.length} bytes`
    );
  }

  return true;
}

/**
 * Get encryption key from environment
 * @returns {Buffer} Encryption key buffer
 * @throws {EncryptionKeyError} If key is invalid
 */
function getEncryptionKey(): Buffer {
  validateEncryptionKey();
  return Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');
}

/**
 * Encrypt a token using AES-256-CBC
 * @param {string} token - Plain text token to encrypt
 * @returns {string} Base64 encoded string: IV + encrypted data
 * @throws {EncryptionKeyError} If encryption key is invalid
 */
export function encryptToken(token: string): string {
  try {
    // Validate inputs
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }

    // Get encryption key
    const key = getEncryptionKey();

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt token
    let encrypted = cipher.update(token, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Concatenate IV + encrypted data and encode as base64
    const result = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'base64'),
    ]).toString('base64');

    return result;
  } catch (error) {
    if (error instanceof EncryptionKeyError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new EncryptionKeyError(`Encryption failed: ${errorMessage}`);
  }
}

/**
 * Decrypt a token using AES-256-CBC
 * @param {string} encrypted - Base64 encoded string (IV + encrypted data)
 * @returns {string} Decrypted plain text token
 * @throws {DecryptionError} If decryption fails
 * @throws {EncryptionKeyError} If encryption key is invalid
 */
export function decryptToken(encrypted: string): string {
  try {
    // Validate inputs
    if (!encrypted || typeof encrypted !== 'string') {
      throw new DecryptionError('Encrypted data must be a non-empty string');
    }

    // Get encryption key
    const key = getEncryptionKey();

    // Decode base64
    const buffer = Buffer.from(encrypted, 'base64');

    // Extract IV (first 16 bytes)
    if (buffer.length < IV_LENGTH) {
      throw new DecryptionError('Invalid encrypted data: too short');
    }

    const iv = buffer.slice(0, IV_LENGTH);
    const encryptedData = buffer.slice(IV_LENGTH);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    // Decrypt
    let decrypted = decipher.update(encryptedData.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    if (error instanceof EncryptionKeyError) {
      throw error;
    }
    if (error instanceof DecryptionError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new DecryptionError(`Decryption failed: ${errorMessage}`);
  }
}

/**
 * Generate a new encryption key (for setup/testing)
 * @returns {string} Base64 encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  const key = crypto.randomBytes(KEY_LENGTH);
  return key.toString('base64');
}

/**
 * Hash a password using bcrypt-compatible PBKDF2
 * @param {string} password - Plain text password
 * @param {string} salt - Salt (optional, will generate if not provided)
 * @returns {Promise<{hash: string, salt: string}>} Hash and salt
 */
export async function hashPassword(
  password: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const keyLength = 64;
  const digest = 'sha512';

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, actualSalt, iterations, keyLength, digest, (err, derivedKey) => {
      if (err) reject(err);
      resolve({
        hash: derivedKey.toString('hex'),
        salt: actualSalt,
      });
    });
  });
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored hash
 * @param {string} salt - Salt used for hashing
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const { hash: computedHash } = await hashPassword(password, salt);
  return computedHash === hash;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random token
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} Hex encoded random token
 */
export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a secure random state token for OAuth
 * @returns {string} Hex encoded 32-byte random token
 */
export function generateOAuthState(): string {
  return generateRandomToken(32);
}

/**
 * Hash data using SHA-256
 * @param {string} data - Data to hash
 * @returns {string} Hex encoded hash
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create HMAC signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} Hex encoded HMAC signature
 */
export function createHmacSignature(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean} True if signature is valid
 */
export function verifyHmacSignature(
  data: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createHmacSignature(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ============================================================================
// Exports
// ============================================================================

export default {
  encryptToken,
  decryptToken,
  validateEncryptionKey,
  generateEncryptionKey,
  hashPassword,
  verifyPassword,
  generateRandomToken,
  generateOAuthState,
  sha256,
  createHmacSignature,
  verifyHmacSignature,
};
