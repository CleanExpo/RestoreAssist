import { describe, expect, it } from "vitest";
import { buildGoogleDriveAuthUrl } from "../google-drive-oauth";

describe("buildGoogleDriveAuthUrl", () => {
  it("includes drive.file + drive.appdata scopes", () => {
    const url = buildGoogleDriveAuthUrl({
      state: "abc",
      codeChallenge: "xyz",
      redirectUri: "http://localhost:3000/api/oauth/google-drive/callback",
      clientId: "test-client-id",
    });
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope") ?? "";
    expect(scope).toContain("https://www.googleapis.com/auth/drive.file");
    expect(scope).toContain("https://www.googleapis.com/auth/drive.appdata");
  });

  it("sets PKCE method S256 + code_challenge", () => {
    const url = buildGoogleDriveAuthUrl({
      state: "abc",
      codeChallenge: "xyz",
      redirectUri: "http://x",
      clientId: "id",
    });
    const p = new URL(url).searchParams;
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe("xyz");
    expect(p.get("state")).toBe("abc");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
  });
});
