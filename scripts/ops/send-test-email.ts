/**
 * Send one transactional test email via Mailtrap (platform config).
 * Usage: npx tsx scripts/ops/send-test-email.ts recipient@example.com
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const to = process.argv[2]?.trim();
if (!to || !to.includes("@")) {
  console.error("Usage: npm run email:test -- recipient@example.com");
  process.exit(1);
}

async function main() {
  const result = await sendTransactionalEmail({
    to,
    subject: "RestoreAssist Mailtrap smoke test",
    html: `<p>If you received this, <strong>MAILTRAP_API_KEY</strong> and <strong>SENDER_EMAIL</strong> are working.</p>`,
    text: "RestoreAssist Mailtrap smoke test — config OK.",
  });

  if (result.error || !result.data?.id) {
    console.error("Send failed:", result.error?.message ?? "no message id");
    process.exit(1);
  }

  console.log("Sent. Provider message id:", result.data.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
