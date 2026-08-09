import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("signInWithOAuth web account switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ url: "/login" });
    signInMock.mockResolvedValue(undefined);
  });

  it("clears any existing RestoreAssist session before Google OAuth", async () => {
    await signInWithOAuth("google", { callbackUrl: "/dashboard" });

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(signOutMock.mock.invocationCallOrder[0]).toBeLessThan(
      signInMock.mock.invocationCallOrder[0],
    );
    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
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
    });
  });

  it("replaces a protocol-relative Apple callback URL before starting OAuth", async () => {
    await signInWithOAuth("apple", { callbackUrl: "//evil.example/steal" });

    expect(signInMock).toHaveBeenCalledWith("apple", {
      callbackUrl: "/dashboard",
    });
  });
});
