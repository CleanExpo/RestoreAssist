/**
 * WS5 — Deny-all service-role-only guard (RA-1807 remediation spec §9/§12, AC-18/AC-19).
 *
 * The 6 RLS-on/zero-policy tables are secure against exposure but any browser/
 * authenticated supabase-js write to them fails SILENTLY. That silence is
 * intentional: every legitimate write is the Prisma owner connection (BYPASSRLS)
 * and the anon supabase-js key is storage-only. This gate makes that intent
 * explicit and enforced:
 *   AC-18 — all 6 are declared in SERVICE_ONLY (documented default-deny), and
 *           none is a tenant-scoped table or receives an emitted policy.
 *   AC-19 — no authenticated supabase-js `.from("<Table>")` write path targets
 *           any of them (adding one would be a silent-failure bug).
 * NO RLS policy is added to any of them — they stay default-deny by design.
 */
import { readdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  SERVICE_ONLY,
  RA4956_MIGRATION,
  readMigration,
  parseEmittedPolicies,
  tenantScopedTables,
} from "../audit-rls-coverage";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The 6 deny-all (RLS-on, zero-policy) tables the audit surfaced. */
const DENY_ALL = [
  "ClientCommsLog",
  "DrNrpgWebhookEvent",
  "FeatureEntitlement",
  "RestorationIncident",
  "StorageRestoreJob",
  "SupportTicketReply",
] as const;

function walkSource(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walkSource(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
      out.push(p);
  }
  return out;
}

describe("WS5 deny-all tables are intentional service-role-only", () => {
  it("AC-18: every deny-all table is declared SERVICE_ONLY", () => {
    for (const t of DENY_ALL) expect(SERVICE_ONLY.has(t)).toBe(true);
  });

  it("AC-18: no deny-all table is tenant-scoped or gets an emitted policy", () => {
    const tenant = new Set(tenantScopedTables());
    const emitted = parseEmittedPolicies(readMigration(RA4956_MIGRATION));
    for (const t of DENY_ALL) {
      expect(tenant.has(t)).toBe(false);
      expect(emitted.has(t)).toBe(false);
    }
  });

  it("AC-19: no supabase-js .from(\"<Table>\") write path targets a deny-all table", () => {
    const pattern = new RegExp(
      `\\.from\\(\\s*['"\`](${DENY_ALL.join("|")})['"\`]`,
    );
    const offenders: string[] = [];
    for (const root of ["lib", "app", "components"]) {
      for (const file of walkSource(resolve(REPO, root))) {
        if (pattern.test(readFileSync(file, "utf8"))) {
          offenders.push(file.replace(REPO, "").replace(/\\/g, "/"));
        }
      }
    }
    expect(offenders, `deny-all tables must never be written via supabase-js`).toEqual(
      [],
    );
  });
});
