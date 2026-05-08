/**
 * Set a user's password directly (admin operation).
 *
 * Use case: the CEO seed (prisma/seed-ceo.ts) creates a placeholder
 * User row for an email that the user hasn't signed up for yet. With
 * a placeholder row in the DB, the /api/auth/register endpoint refuses
 * to register because findUnique sees the existing row and returns
 * 400 CONFLICT. This script writes a bcrypt hash directly to the
 * existing row so the user can log in via /login without going through
 * the signup form.
 *
 * SECURITY:
 *   - Password is read from the terminal with echo OFF (never stored in
 *     argv, env vars, or shell history).
 *   - bcrypt cost 12 (matches app/api/auth/register/route.ts:111).
 *   - Refuses passwords shorter than 12 chars (NIST SP 800-63B floor,
 *     same as registration).
 *   - Does NOT call the HIBP breach check — that's a registration-time
 *     guard. If the user picks a weak password here it's their call.
 *   - Logs only the email + a SECURITY_EVENT row; never the password.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/set-user-password.ts <email>
 *
 * Then enter the password (twice) at the prompt.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { stdin, stdout } from "node:process";

const prisma = new PrismaClient();
const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 12;

/**
 * Read a line from stdin with echo disabled. Only writes the prompt
 * and the trailing newline; what the user types is invisible.
 *
 * Implementation: enables raw mode, intercepts each keystroke, and
 * never echoes it. Backspace is honoured.
 */
function readPasswordSilently(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(
        new Error(
          "stdin is not a TTY — this script must be run interactively, " +
            "not piped from a file or another process.",
        ),
      );
      return;
    }
    stdout.write(prompt);
    const chars: string[] = [];
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (input: string): void => {
      for (const ch of input) {
        if (ch === "\n" || ch === "\r" || ch === "\u0004" /* ^D */) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(chars.join(""));
          return;
        }
        if (ch === "\u0003" /* ^C */) {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          chars.pop();
          continue;
        }
        chars.push(ch);
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("usage: npx tsx scripts/set-user-password.ts <email>");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, password: true, role: true },
  });
  if (!existing) {
    console.error(`❌ No user row exists for ${email}.`);
    console.error(
      `   This script only sets the password on existing rows. ` +
        `If you want to create the user, sign up at /signup instead.`,
    );
    process.exit(2);
  }

  console.log(`Setting password for: ${existing.email} (role=${existing.role})`);
  if (existing.password) {
    console.log(
      `⚠️  This account already has a password on file. Continuing will ` +
        `OVERWRITE it.`,
    );
  }
  console.log(
    `   Password requirements: minimum ${MIN_PASSWORD_LENGTH} chars. ` +
      `Input is hidden.`,
  );

  const pw1 = await readPasswordSilently("Password: ");
  if (pw1.length < MIN_PASSWORD_LENGTH) {
    console.error(`❌ Password must be at least ${MIN_PASSWORD_LENGTH} chars.`);
    process.exit(3);
  }
  const pw2 = await readPasswordSilently("Confirm:  ");
  if (pw1 !== pw2) {
    console.error("❌ Passwords do not match.");
    process.exit(4);
  }

  const hashed = await bcrypt.hash(pw1, BCRYPT_COST);
  await prisma.user.update({
    where: { id: existing.id },
    data: { password: hashed, mustChangePassword: false } as any,
  });

  // Audit trail. SecurityEvent.details is a free-form String column.
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: "PASSWORD_SET_BY_ADMIN_SCRIPT",
        severity: "WARNING",
        userId: existing.id,
        email: existing.email,
        details: JSON.stringify({ script: "scripts/set-user-password.ts" }),
      },
    });
  } catch {
    // Logging failure is non-fatal — password is already set.
  }

  console.log(`✅ Password set for ${existing.email}.`);
  console.log(`   Sign in at /login with this email + password.`);
}

main()
  .catch((err) => {
    console.error(
      "❌ Failed:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  })
  .finally(async () => {
    // Ensure stdin doesn't keep the process alive.
    if (stdin.isTTY) {
      try {
        stdin.setRawMode(false);
      } catch {
        /* no-op */
      }
    }
    await prisma.$disconnect();
  });

