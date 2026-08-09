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
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
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

  it("forces a fresh Google credential and binds its nonce to the exchange", async () => {
    await signInWithOAuth("google", { callbackUrl: "/dashboard" });

    const loginRequest = socialLogin.mock.calls[0][0] as {
      provider: string;
      options: { nonce: string; forcePrompt?: boolean };
    };
    expect(loginRequest.provider).toBe("google");
    expect(loginRequest.options.forcePrompt).toBe(true);
    expect(loginRequest.options.nonce).toMatch(/^[A-Za-z0-9_-]+$/);

    const exchangeInit = fetchMock.mock.calls[0][1] as RequestInit;
    const exchangeBody = JSON.parse(String(exchangeInit.body)) as {
      provider: string;
      nonce: string;
    };
    expect(exchangeBody).toMatchObject({
      provider: "google",
      nonce: loginRequest.options.nonce,
    });
  });
});
