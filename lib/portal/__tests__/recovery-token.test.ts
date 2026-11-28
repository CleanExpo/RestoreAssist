/**
 * RA-8613 - the stateless portal password-recovery link.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";

import { getClientPortalSecret } from "../credential-fingerprint";
import { signClientPortalJwt, verifyClientPortalJwt } from "../client-jwt";
import {
  RECOVERY_LIFETIME_SECONDS,
  RECOVERY_WINDOW_SECONDS,
  looksLikeRecoveryToken,
  recoveryLinkIsLive,
  signRecoveryToken,
  verifyRecoveryToken,
} from "../recovery-token";

const ACCOUNT = {
  clientUserId: "client_user_1",
  clientId: "client_1",
  email: "homeowner@example.com",
  passwordHash: "$2a$10$hash-for-the-forgotten-password",
};
const T0 = new Date("2026-11-26T01:05:00.000Z"); // inside a half-hour window

describe("recovery token", () => {
  it("verifies and names the account, the email and the password it was issued for", async () => {
    const token = await signRecoveryToken(ACCOUNT, T0);
    const claims = await verifyRecoveryToken(token, T0);
    expect(claims).toMatchObject({
      clientUserId: ACCOUNT.clientUserId,
      clientId: ACCOUNT.clientId,
      email: ACCOUNT.email,
    });
    expect(recoveryLinkIsLive(claims!, ACCOUNT.passwordHash)).toBe(true);
    expect(recoveryLinkIsLive(claims!, "$2a$10$a-new-hash")).toBe(false);
  });

  it("is the same link for repeated requests in one window (no pile of live links)", async () => {
    const a = await signRecoveryToken(ACCOUNT, T0);
    const b = await signRecoveryToken(
      ACCOUNT,
      new Date(T0.getTime() + 10 * 60 * 1000),
    );
    expect(b).toBe(a);
  });

  it("is a different link in the next window", async () => {
    const a = await signRecoveryToken(ACCOUNT, T0);
    const b = await signRecoveryToken(
      ACCOUNT,
      new Date(T0.getTime() + RECOVERY_WINDOW_SECONDS * 1000),
    );
    expect(b).not.toBe(a);
  });

  it("lives between 30 and 60 minutes, then is refused", async () => {
    const token = await signRecoveryToken(ACCOUNT, T0);
    const at = (minutes: number) =>
      verifyRecoveryToken(token, new Date(T0.getTime() + minutes * 60 * 1000));
    expect(RECOVERY_LIFETIME_SECONDS).toBe(60 * 60);
    expect(await at(29)).not.toBeNull();
    expect(await at(61)).toBeNull();
    expect(await at(24 * 60)).toBeNull();
  });

  it("changes when the password changes", async () => {
    const a = await signRecoveryToken(ACCOUNT, T0);
    const b = await signRecoveryToken(
      { ...ACCOUNT, passwordHash: "$2a$10$a-new-hash" },
      T0,
    );
    expect(b).not.toBe(a);
  });

  it("never carries the stored password hash", async () => {
    const token = await signRecoveryToken(ACCOUNT, T0);
    const payload = Buffer.from(token.split(".")[1], "base64url").toString();
    expect(payload).not.toContain(ACCOUNT.passwordHash);
  });

  it("is not accepted from a portal session token, which shares the signing secret", async () => {
    const session = await signClientPortalJwt({
      clientUserId: ACCOUNT.clientUserId,
      clientId: ACCOUNT.clientId,
      email: ACCOUNT.email,
      name: "Home Owner",
      passwordHash: ACCOUNT.passwordHash,
    });
    expect(await verifyRecoveryToken(session)).toBeNull();
  });

  it("is not accepted as a portal session token either", async () => {
    const token = await signRecoveryToken(ACCOUNT, new Date());
    expect(await verifyClientPortalJwt(token)).toBeNull();
  });

  it("is refused when signed with another algorithm under the same secret", async () => {
    const good = await signRecoveryToken(ACCOUNT, T0);
    const payload = JSON.parse(
      Buffer.from(good.split(".")[1], "base64url").toString(),
    );
    const other = await new SignJWT({
      clientId: payload.clientId,
      email: payload.email,
      typ: payload.typ,
      cfp: payload.cfp,
    })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject(payload.sub)
      .setIssuedAt(payload.iat)
      .setExpirationTime(payload.exp)
      .sign(getClientPortalSecret());
    expect(await verifyRecoveryToken(other, T0)).toBeNull();
  });

  it("returns null, not a throw, for garbage", async () => {
    expect(await verifyRecoveryToken("not.a.jwt")).toBeNull();
    expect(await verifyRecoveryToken("")).toBeNull();
  });

  it("is told apart from an invitation token by shape", async () => {
    expect(looksLikeRecoveryToken(await signRecoveryToken(ACCOUNT, T0))).toBe(
      true,
    );
    expect(looksLikeRecoveryToken("c" + "a".repeat(24))).toBe(false);
    expect(looksLikeRecoveryToken(undefined)).toBe(false);
    expect(looksLikeRecoveryToken({ a: 1 })).toBe(false);
  });
});

// The link may only be minted for an email and checked by the two public
// portal routes. Any other importer (a list API, a dashboard route, a log
// line) is how the link would reach a contractor.
describe("who may import the recovery token module", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const ALLOWED = new Set([
    "lib/portal/recovery-email.ts",
    "app/api/portal/invitations/accept/route.ts",
    "app/api/portal/invitations/verify/route.ts",
  ]);

  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "__tests__") {
        continue;
      }
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) sources(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("is imported only by the mint-and-email helper and the two public routes", () => {
    const importers = ["app", "lib", "components"]
      .flatMap((d) => sources(path.join(ROOT, d)))
      .filter((f) =>
        /from\s+["'](@\/lib\/portal\/recovery-token|\.{1,2}\/(?:.*\/)?recovery-token)["']/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
    expect(importers.sort()).toEqual([...ALLOWED].sort());
  });
});
