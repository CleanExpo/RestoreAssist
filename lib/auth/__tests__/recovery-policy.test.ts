import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { passwordResetToken: { create: h.create, deleteMany: h.remove } } }));
vi.mock("@/lib/email/send-transactional", () => ({ sendTransactionalEmail: h.send, EMAIL_SEND_TIMEOUT_MS: 1000 }));
vi.mock("@/lib/email/resolve-platform-config", () => ({ isEmailServiceConfigured: () => true, resolveFromAddress: () => "sender@example.com" }));
import { storeResetCode } from "@/lib/password-reset-store";
import { sendPasswordResetEmail } from "@/lib/email";
import { RESET_CODE_TTL_MINUTES } from "../recovery-policy";

beforeEach(() => {
  vi.clearAllMocks();
  h.remove.mockResolvedValue({ count: 0 });
  h.create.mockImplementation(async ({ data }) => ({ id: "synthetic-token-id", expiresAt: data.expiresAt }));
  h.send.mockResolvedValue({ data: { id: "synthetic-receipt" }, error: null });
});
describe("recovery lifetime contract", () => {
  it("uses the same ten-minute lifetime in stored expiry and rendered email text/HTML", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const stored = await storeResetCode("SYNTHETIC@example.com", "123456");
      expect(stored.expiresAt.getTime() - now).toBe(10 * 60 * 1000);
      expect(RESET_CODE_TTL_MINUTES).toBe(10);
      await sendPasswordResetEmail({ recipientName: "Synthetic", recipientEmail: "synthetic@example.com", resetCode: "123456" });
      const payload = h.send.mock.calls[0][0];
      expect(payload.html).toContain("10 minutes after the request");
      expect(payload.text).toContain("10 minutes after the request");
      expect(payload.html + payload.text).not.toContain("15 minutes");
    } finally { vi.restoreAllMocks(); }
  });
});
