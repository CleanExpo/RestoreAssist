/**
 * Portal JWT auth — sign/verify round-trip, type boundary, tamper rejection.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  authenticateClientRequest,
  signClientPortalJwt,
  verifyClientPortalJwt,
} from "@/lib/portal/client-jwt";

const INPUT = {
  clientUserId: "cu_1",
  clientId: "client_1",
  email: "homeowner@example.com",
  name: "Home Owner",
};

beforeEach(() => {
  process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";
});

describe("client portal JWT", () => {
  it("round-trips claims", async () => {
    const token = await signClientPortalJwt(INPUT);
    const claims = await verifyClientPortalJwt(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe("cu_1");
    expect(claims!.clientId).toBe("client_1");
    expect(claims!.email).toBe(INPUT.email);
    expect(claims!.typ).toBe("client-portal");
  });

  it("rejects a tampered token", async () => {
    const token = await signClientPortalJwt(INPUT);
    const [h, p, s] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(p, "base64url").toString()),
        clientId: "someone-elses-client",
      }),
    ).toString("base64url");
    expect(await verifyClientPortalJwt(`${h}.${forgedPayload}.${s}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signClientPortalJwt(INPUT);
    process.env.CLIENT_PORTAL_JWT_SECRET = "a-completely-different-secret!!!!!";
    expect(await verifyClientPortalJwt(token)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyClientPortalJwt("not-a-jwt")).toBeNull();
    expect(await verifyClientPortalJwt("")).toBeNull();
  });

  it("authenticates a request via Bearer header", async () => {
    const token = await signClientPortalJwt(INPUT);
    const request = new NextRequest("http://localhost/api/portal/reports", {
      headers: { authorization: `Bearer ${token}` },
    });
    const claims = await authenticateClientRequest(request);
    expect(claims?.clientId).toBe("client_1");
  });

  it("returns null when the header is absent or malformed", async () => {
    const noHeader = new NextRequest("http://localhost/api/portal/reports");
    expect(await authenticateClientRequest(noHeader)).toBeNull();

    const badScheme = new NextRequest("http://localhost/api/portal/reports", {
      headers: { authorization: "Basic abc" },
    });
    expect(await authenticateClientRequest(badScheme)).toBeNull();
  });
});
