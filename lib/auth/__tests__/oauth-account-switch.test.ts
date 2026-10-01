import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, signOutMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
  signOut: signOutMock,
}));

vi.mock("@/lib/capacitor", () => ({
  isCapacitorAndroid: () => false,
  isCapacitorIOS: () => false,
}));

import { signInWithOAuth } from "@/lib/oauth-native";

afterEach(() => vi.unstubAllGlobals());

describe("signInWithOAuth web account switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ url: "/login" });
    signInMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null")));
  });

  it("clears any existing RestoreAssist session before Google OAuth", async () => {
    await signInWithOAuth("google", { callbackUrl: "/dashboard" });

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(signOutMock.mock.invocationCallOrder[0]).toBeLessThan(
      signInMock.mock.invocationCallOrder[0],
    );
    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    }, { prompt: "select_account" });
  });

  it("clears any existing RestoreAssist session before Apple OAuth", async () => {
    await signInWithOAuth("apple", { callbackUrl: "/dashboard" });

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(signOutMock.mock.invocationCallOrder[0]).toBeLessThan(
      signInMock.mock.invocationCallOrder[0],
    );
    expect(signInMock).toHaveBeenCalledWith("apple", {
      callbackUrl: "/dashboard",
    });
  });

  it("replaces an external Google callback URL before starting OAuth", async () => {
    await signInWithOAuth("google", {
      callbackUrl: "https://evil.example/steal",
    });

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    }, { prompt: "select_account" });
  });

  it("replaces a protocol-relative Apple callback URL before starting OAuth", async () => {
    await signInWithOAuth("apple", { callbackUrl: "//evil.example/steal" });

    expect(signInMock).toHaveBeenCalledWith("apple", {
      callbackUrl: "/dashboard",
    });
  });
});


describe("OAuth interruption and repeated clicks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ url: "/login" });
    signInMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null")));
  });
  it("does not start OAuth when sign-out fails", async () => {
    signOutMock.mockRejectedValueOnce(new Error("offline"));
    await expect(signInWithOAuth("google")).rejects.toThrow();
    expect(signInMock).not.toHaveBeenCalled();
  });
  it("refuses to link a provider while a cached app session remains", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: "previous-user" } }))));
    await expect(signInWithOAuth("google")).rejects.toThrow();
    expect(signInMock).not.toHaveBeenCalled();
  });
  it.each([503, 403])("fails closed when session clearance cannot be checked (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    await expect(signInWithOAuth("google")).rejects.toThrow();
    expect(signInMock).not.toHaveBeenCalled();
  });
  it("coalesces repeated clicks so only one OAuth state is created, then permits retry", async () => {
    let finish!: (value: { url: string }) => void;
    signOutMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const one = signInWithOAuth("google");
    const two = signInWithOAuth("google");
    expect(signOutMock).toHaveBeenCalledTimes(1);
    finish({ url: "/login" });
    await Promise.all([one, two]);
    expect(signInMock).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null")));
    await signInWithOAuth("google");
    expect(signInMock).toHaveBeenCalledTimes(2);
  });
  it("allows a new attempt after interrupted OAuth", async () => {
    signInMock.mockRejectedValueOnce(new Error("cancelled"));
    await expect(signInWithOAuth("google")).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null")));
    await signInWithOAuth("google");
    expect(signInMock).toHaveBeenCalledTimes(2);
  });
});


it.each(["not-json", "false", "[]", '{"error":"unavailable"}'])("does not start OAuth on an unexpected session response: %s", async (body) => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue({ url: "/login" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(signInWithOAuth("google")).rejects.toThrow();
  expect(signInMock).not.toHaveBeenCalled();
});
