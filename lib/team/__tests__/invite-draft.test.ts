// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearInviteDraft,
  readInviteDraft,
  saveInviteDraft,
} from "../invite-draft";

const DAY = 24 * 60 * 60 * 1000;

describe("invite draft", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("survives a reload: what was saved is read back", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    expect(readInviteDraft("u1")).toEqual({
      email: "tech@example.com",
      role: "USER",
    });
  });

  it("is scoped per user", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    expect(readInviteDraft("u2")).toBeNull();
  });

  it("expires after 24 hours and removes itself", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    vi.setSystemTime(Date.now() + DAY + 1);
    expect(readInviteDraft("u1")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("clears", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    clearInviteDraft("u1");
    expect(readInviteDraft("u1")).toBeNull();
  });

  it("stores only the email, the role and the expiry, never a key", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    const raw = window.localStorage.getItem(window.localStorage.key(0)!)!;
    expect(raw).toContain("tech@example.com");
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "email",
      "expiresAt",
      "role",
    ]);
  });

  it("treats corrupt storage as no draft", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    window.localStorage.setItem(window.localStorage.key(0)!, "{not json");
    expect(readInviteDraft("u1")).toBeNull();
  });

  it("refuses an unknown role from storage", () => {
    saveInviteDraft("u1", { email: "tech@example.com", role: "USER" });
    window.localStorage.setItem(
      window.localStorage.key(0)!,
      JSON.stringify({
        email: "tech@example.com",
        role: "ADMIN",
        expiresAt: Date.now() + DAY,
      }),
    );
    expect(readInviteDraft("u1")).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(readInviteDraft("u1")).toBeNull();
    spy.mockRestore();
  });
});
