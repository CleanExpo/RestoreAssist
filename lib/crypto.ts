import crypto from 'crypto'

// Use NEXTAUTH_SECRET as encryption key (already in .env)
const ENCRYPTION_KEY = process.env.NEXTAUTH_SECRET || ''
const ALGORITHM = 'aes-256-gcm'

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.warn('NEXTAUTH_SECRET is not properly configured for encryption')
}

/**
 * Encrypt sensitive data (like API keys) using AES-256-GCM
 */
export function encrypt(text: string): string {
  try {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16)

    // Create cipher
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Get auth tag
    const authTag = cipher.getAuthTag()

    // Return iv + authTag + encrypted data (all hex encoded)
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt sensitive data (like API keys) using AES-256-GCM
 */
export function decrypt(encryptedText: string): string {
  try {
    // Split the encrypted text into components
    const parts = encryptedText.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format')
    }

    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]

    // Create decipher
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}
