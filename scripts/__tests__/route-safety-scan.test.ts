import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditRouteSafety } from "../security/route-safety-scan.mjs";

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
