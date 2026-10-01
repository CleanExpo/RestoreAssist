import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { passwordResetToken: { findFirst: h.findFirst, update: h.update, updateMany: h.updateMany, delete: h.remove } } }));
import { verifyResetCode } from "@/lib/password-reset-store";
let entry: { id: string; token: string; attempts: number; usedAt: Date | null; expiresAt: Date };
beforeEach(() => {
  vi.clearAllMocks();
  entry = { id: "synthetic-code-version", token: "123456", attempts: 0, usedAt: null, expiresAt: new Date(Date.now() + 600_000) };
  h.findFirst.mockImplementation(async () => entry.usedAt ? null : { ...entry });
  h.update.mockImplementation(async ({ data }) => Object.assign(entry, data));
  h.updateMany.mockImplementation(async ({ where, data }) => {
    if (entry.id !== where.id || entry.token !== where.token || entry.usedAt !== where.usedAt || entry.attempts >= where.attempts.lt || entry.expiresAt <= where.expiresAt.gt) return { count: 0 };
    entry.attempts += data.attempts.increment;
    if (data.usedAt) entry.usedAt = data.usedAt;
    return { count: 1 };
  });
});
it("accepts a valid one-time code only once across concurrent resets and rejects replay", async () => {
  const results = await Promise.all([verifyResetCode("synthetic@example.com", "123456"), verifyResetCode("synthetic@example.com", "123456")]);
  expect(results.filter((r) => r.valid)).toHaveLength(1);
  expect((await verifyResetCode("synthetic@example.com", "123456")).valid).toBe(false);
});
it("counts parallel wrong guesses atomically and stops at the five-attempt cap", async () => {
  entry.attempts = 4;
  const results = await Promise.all([verifyResetCode("synthetic@example.com", "999999"), verifyResetCode("synthetic@example.com", "999999")]);
  expect(results.every((r) => !r.valid)).toBe(true);
  expect(entry.attempts).toBe(5);
});
it("cannot lose increments for concurrent wrong guesses", async () => {
  await Promise.all([verifyResetCode("synthetic@example.com", "999999"), verifyResetCode("synthetic@example.com", "999999")]);
  expect(entry.attempts).toBe(2);
});
it("refuses a token that expires after the read and before the claim", async () => {
  h.findFirst.mockImplementation(async () => {
    const snapshot = { ...entry };
    entry.expiresAt = new Date(0);
    return snapshot;
  });
  expect((await verifyResetCode("synthetic@example.com", "123456")).valid).toBe(false);
  expect(entry.usedAt).toBeNull();
});
