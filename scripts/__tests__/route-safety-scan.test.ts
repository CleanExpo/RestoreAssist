import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditRouteSafety,
  compareRawAdminBaseline,
} from "../security/route-safety-scan.mjs";

const INTAKE_PATH = "app/api/revenue/job-file-audit/intake/route.ts";
const intakeSource = readFileSync(join(process.cwd(), INTAKE_PATH), "utf8");

describe("route-safety capability authentication", () => {
  it("accepts only the exact paid-intake route with every reviewed control", () => {
    expect(auditRouteSafety(INTAKE_PATH, intakeSource)).toEqual([]);

    expect(
      auditRouteSafety(
        "app/api/revenue/job-file-audit/intake/status/route.ts",
        intakeSource,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ class: "mutation-no-auth" }),
      ]),
    );
  });

  it.each([
    ["Stripe retrieval", "stripe.checkout.sessions.retrieve("],
    ["paid status", 'checkoutSession.payment_status !== "paid"'],
    ["offer binding", 'checkoutSession.metadata?.offer !== "job-file-audit"'],
    ["payer lookup", "checkoutSession.customer_details?.email"],
    [
      "payer binding",
      "payerEmail.trim().toLowerCase() !== data.email.trim().toLowerCase()",
    ],
    ["fail-closed rate limit", "failClosedOnUpstashError: true"],
    [
      "replay key",
      'externalReference: `stripe:job-file-audit:${checkoutSession.id}`',
    ],
  ])("reports the route when its %s control is removed", (_name, marker) => {
    const mutatedSource = intakeSource.replace(marker, "REMOVED_CONTROL");
    expect(mutatedSource).not.toBe(intakeSource);
    expect(auditRouteSafety(INTAKE_PATH, mutatedSource)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ class: "mutation-no-auth" }),
      ]),
    );
  });
});

// RA-7647 — every self-signup is role ADMIN, so a route whose only admin gate
// is verifyAdminFromDb( admits every trial business. The class is flagged
// even though the route IS gated: this is about the gate being insufficient,
// not absent.
const PLANTED_PATH = "app/api/planted/route.ts";
const rawAdminSource = `
import { getServerSession } from "next-auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  await prisma.insurerProfile.update({ where: { id: "x" }, data: {} });
}
`;
const GATE_LINE = "if (auth.response) return auth.response;";

describe("route-safety raw-admin-gate (RA-7647)", () => {
  it("flags a route whose only admin gate is verifyAdminFromDb", () => {
    expect(auditRouteSafety(PLANTED_PATH, rawAdminSource)).toEqual([
      expect.objectContaining({ file: PLANTED_PATH, class: "raw-admin-gate" }),
    ]);
  });

  it("accepts the same route once it also calls verifyTenantAdmin(", () => {
    const scoped = rawAdminSource.replace(
      GATE_LINE,
      `${GATE_LINE}\n  const tenant = verifyTenantAdmin(auth);`,
    );
    expect(scoped).not.toBe(rawAdminSource);
    expect(auditRouteSafety(PLANTED_PATH, scoped)).toEqual([]);
  });

  it.each([
    "verifyPlatformOperator(",
    "verifyPlatformSupportOperator(",
    "verifyStorePublishingOperator(",
  ])("accepts the same route once it also calls %s", (gate) => {
    const scoped = rawAdminSource.replace(
      GATE_LINE,
      `${GATE_LINE}\n  const operator = ${gate}auth);`,
    );
    expect(auditRouteSafety(PLANTED_PATH, scoped)).toEqual([]);
  });

  it("does not flag a route that never calls verifyAdminFromDb", () => {
    const sessionOnly = rawAdminSource
      .replace("const auth = await verifyAdminFromDb(session);", "")
      .replace(GATE_LINE, "");
    expect(auditRouteSafety(PLANTED_PATH, sessionOnly)).toEqual([]);
  });
});

describe("raw-admin-gate baseline can only shrink (RA-7647)", () => {
  const raw = (file: string) => ({ file, class: "raw-admin-gate", reason: "" });

  it("reports an offender missing from the baseline as new", () => {
    const result = compareRawAdminBaseline(
      [raw("app/api/old/route.ts"), raw("app/api/new/route.ts")],
      ["app/api/old/route.ts"],
    );
    expect(result.fresh.map((f: { file: string }) => f.file)).toEqual([
      "app/api/new/route.ts",
    ]);
    expect(result.known.map((f: { file: string }) => f.file)).toEqual([
      "app/api/old/route.ts",
    ]);
    expect(result.stale).toEqual([]);
  });

  it("reports a baseline entry that no longer offends as stale", () => {
    const result = compareRawAdminBaseline(
      [raw("app/api/old/route.ts")],
      ["app/api/old/route.ts", "app/api/fixed/route.ts"],
    );
    expect(result.stale).toEqual(["app/api/fixed/route.ts"]);
    expect(result.fresh).toEqual([]);
  });

  it("ignores findings of other classes", () => {
    const result = compareRawAdminBaseline(
      [{ file: "app/api/x/route.ts", class: "mutation-no-auth", reason: "" }],
      [],
    );
    expect(result).toEqual({ known: [], fresh: [], stale: [] });
  });
});
