/**
 * RA-8399 — creating a support ticket alerts staff, best-effort.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supportTicketCreate = vi.fn();
const sendTransactionalEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      create: (...args: unknown[]) => supportTicketCreate(...args),
    },
  },
}));
vi.mock("@/lib/email/send-transactional", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));

import {
  createSupportTicket,
  SUPPORT_ALERT_BODY_PREVIEW_CHARS,
} from "../create-ticket";

const input = {
  email: "jane@example.com",
  name: "Jane <b>Restorer</b>",
  subject: "Cannot export\r\nBcc: x@example.com",
  body: "x".repeat(SUPPORT_ALERT_BODY_PREVIEW_CHARS) + "TAIL-NOT-SENT",
  category: "technical",
  priority: "urgent",
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  supportTicketCreate.mockReset();
  sendTransactionalEmail.mockReset();
  supportTicketCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "tkt_1",
      ...data,
    }),
  );
  sendTransactionalEmail.mockResolvedValue({ data: { id: "m1" }, error: null });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe("createSupportTicket", () => {
  it("saves the row, then sends one alert with id, priority, sender and a 500-character preview", async () => {
    vi.stubEnv("SUPPORT_ALERT_EMAIL", "triage@example.com");

    const ticket = await createSupportTicket(input);

    expect(ticket.id).toBe("tkt_1");
    expect(supportTicketCreate).toHaveBeenCalledWith({ data: input });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const alert = sendTransactionalEmail.mock.calls[0][0];
    expect(alert.to).toBe("triage@example.com");
    expect(alert.subject).toContain("[Support URGENT]");
    expect(alert.subject).toContain("tkt_1");
    // Subject is a header: CR/LF from the sender must be folded.
    expect(alert.subject).not.toMatch(/[\r\n]/);
    expect(alert.text).toContain("jane@example.com");
    expect(alert.text).not.toContain("TAIL-NOT-SENT");
    expect(alert.html).not.toContain("<b>Restorer</b>");
    expect(alert.html).toContain("&lt;b&gt;Restorer");
    expect(alert.idempotencyKey).toBe("support-ticket-alert:tkt_1");
  });

  it("falls back to the brand support mailbox when SUPPORT_ALERT_EMAIL is unset", async () => {
    vi.stubEnv("SUPPORT_ALERT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");

    await createSupportTicket(input);

    expect(sendTransactionalEmail.mock.calls[0][0].to).toBe(
      "support@restoreassist.app",
    );
  });

  it("returns the saved ticket and logs the ticket id when the transport throws", async () => {
    sendTransactionalEmail.mockRejectedValue(new Error("boom"));

    const ticket = await createSupportTicket(input);

    expect(ticket.id).toBe("tkt_1");
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("tkt_1");
  });

  it("returns the saved ticket and logs when the provider rejects the send", async () => {
    sendTransactionalEmail.mockResolvedValue({
      data: null,
      error: { name: "not_configured", message: "not configured" },
    });

    const ticket = await createSupportTicket(input);

    expect(ticket.id).toBe("tkt_1");
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("tkt_1");
  });

  it("propagates a database error unchanged and sends no alert", async () => {
    supportTicketCreate.mockRejectedValue({ code: "P2002" });

    await expect(createSupportTicket(input)).rejects.toEqual({
      code: "P2002",
    });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
