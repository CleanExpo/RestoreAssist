import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const socialLoginInitialize = vi.hoisted(() => vi.fn());
const socialLogin = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/capacitor", () => ({
  isCapacitorAndroid: () => false,
  isCapacitorIOS: () => true,
}));
vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize: (...args: unknown[]) => socialLoginInitialize(...args),
    login: (...args: unknown[]) => socialLogin(...args),
  },
}));

import { signInWithOAuth, type OAuthProvider } from "@/lib/oauth-native";

beforeEach(() => {
  socialLoginInitialize.mockResolvedValue(undefined);
  socialLogin.mockReset();
  socialLogin.mockResolvedValue({ result: { idToken: "identity-token" } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    url === "/api/auth/native-nonce"
      ? new Response(JSON.stringify({ nonce: "server-issued-nonce" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : new Response(null, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    crypto: globalThis.crypto,
    location: { href: "" },
    alert: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native OAuth callback completion", () => {
  it.each<OAuthProvider>(["google", "apple"])(
    "replaces an external %s callback before native navigation",
    async (provider) => {
      await signInWithOAuth(provider, {
        callbackUrl: "https://evil.example/steal",
      });

      expect(window.location.href).toBe("/dashboard");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/native-token-exchange",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
      expect(socialLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ nonce: "server-issued-nonce" }),
        }),
      );
    },
  );

  it("preserves a valid internal callback after native sign-in", async () => {
    await signInWithOAuth("google", {
      callbackUrl: "/dashboard/inspections/inspection_1?tab=scope",
    });

    expect(window.location.href).toBe(
      "/dashboard/inspections/inspection_1?tab=scope",
    );
  });
});
