/**
 * Encrypted persistence boundary for EmailConnection OAuth credentials.
 *
 * EmailConnection is intentionally service-only under RLS. These helpers add
 * the second boundary: access and refresh tokens are AES-256-GCM ciphertext at
 * rest and plaintext/corrupt rows are never returned to a provider caller.
 */
import { decrypt, encrypt } from "@/lib/credential-vault";
import { prisma } from "@/lib/prisma";

export const EMAIL_CONNECTION_TOKEN_FIELDS = [
  "accessToken",
  "refreshToken",
] as const;

type EmailConnectionTokenField = (typeof EMAIL_CONNECTION_TOKEN_FIELDS)[number];

type EmailConnectionTokenShape = Record<EmailConnectionTokenField, string>;

export type EmailConnectionProvider = "google" | "microsoft";

export interface SaveEmailConnectionInput extends EmailConnectionTokenShape {
  userId: string;
  provider: EmailConnectionProvider;
  email: string;
  expiresAt: Date;
}

export class EmailConnectionCredentialUnavailableError extends Error {
  readonly code = "EMAIL_CONNECTION_CREDENTIAL_UNAVAILABLE";

  constructor() {
    super(
      "Email connection credentials are unavailable; reconnect the provider.",
    );
    this.name = "EmailConnectionCredentialUnavailableError";
  }
}

// credential-vault emits a 16-byte IV, 16-byte GCM authentication tag, and a
// non-empty even-length hexadecimal ciphertext segment.
const CIPHER_SHAPE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]{2}(?:[0-9a-f]{2})*$/i;

export function isEncryptedEmailConnectionToken(value: string): boolean {
  return CIPHER_SHAPE.test(value);
}

function credentialUnavailable(): never {
  throw new EmailConnectionCredentialUnavailableError();
}

function assertDedicatedVaultKey(): void {
  // EmailConnection OAuth credentials never inherit the general vault's
  // NEXTAUTH_SECRET development fallback. Auth-secret rotation must not make
  // stored provider refresh tokens permanently unreadable.
  if (
    !process.env.CREDENTIAL_ENCRYPTION_KEY &&
    !process.env.INTEGRATION_ENCRYPTION_KEY
  ) {
    credentialUnavailable();
  }
}

function encryptTokenForStorage(value: string): string {
  assertDedicatedVaultKey();
  if (value.length === 0) return credentialUnavailable();

  if (isEncryptedEmailConnectionToken(value)) {
    // Idempotency must not become a bypass for cipher-shaped garbage or a row
    // encrypted under an unrelated key. Authenticate before accepting it.
    try {
      decrypt(value);
      return value;
    } catch {
      return credentialUnavailable();
    }
  }

  return encrypt(value);
}

function decryptStoredToken(value: string): string {
  assertDedicatedVaultKey();
  // Unlike the older Account transition helper, EmailConnection has no
  // plaintext fallback. Legacy rows must go through the owner-gated backfill.
  if (!isEncryptedEmailConnectionToken(value)) return credentialUnavailable();

  try {
    const plaintext = decrypt(value);
    if (plaintext.length === 0) return credentialUnavailable();
    return plaintext;
  } catch {
    return credentialUnavailable();
  }
}

export function encryptEmailConnectionTokens<
  T extends EmailConnectionTokenShape,
>(value: T): T {
  return {
    ...value,
    accessToken: encryptTokenForStorage(value.accessToken),
    refreshToken: encryptTokenForStorage(value.refreshToken),
  };
}

export function decryptEmailConnectionTokens<
  T extends EmailConnectionTokenShape,
>(value: T): T {
  return {
    ...value,
    accessToken: decryptStoredToken(value.accessToken),
    refreshToken: decryptStoredToken(value.refreshToken),
  };
}

/** The only application write path for EmailConnection credentials. */
export async function saveEmailConnection(input: SaveEmailConnectionInput) {
  const encrypted = encryptEmailConnectionTokens(input);
  return prisma.emailConnection.upsert({
    where: { userId: input.userId },
    create: encrypted,
    update: {
      provider: encrypted.provider,
      email: encrypted.email,
      accessToken: encrypted.accessToken,
      refreshToken: encrypted.refreshToken,
      expiresAt: encrypted.expiresAt,
    },
  });
}

/**
 * Read and authenticate stored credentials. A legacy plaintext row, corrupt
 * GCM tag, or wrong key throws the same sanitised reconnect error.
 */
export async function getEmailConnectionForUser(userId: string) {
  const row = await prisma.emailConnection.findUnique({ where: { userId } });
  return row ? decryptEmailConnectionTokens(row) : null;
}
