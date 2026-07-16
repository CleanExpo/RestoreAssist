/**
 * Guards the prod CVE gate (scripts/audit-prod-cves.ts) that replaced the
 * retired `pnpm audit` endpoint. Fixtures use the REAL shape returned by the
 * npm bulk advisory endpoint (POST /-/npm/v1/security/advisories/bulk), so a
 * silent parser drift — which would make the gate pass everything — fails here.
 */

import { describe, expect, it } from "vitest";
import {
  selectBlockingFindings,
  ghsaFromUrl,
  type BulkAdvisory,
} from "../audit-prod-cves";

const LODASH_HIGH: BulkAdvisory = {
  severity: "high",
  title: "Command Injection in lodash",
  url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
  vulnerable_versions: "<4.17.21",
};
const LODASH_MODERATE: BulkAdvisory = {
  severity: "moderate",
  title: "Regular Expression Denial of Service (ReDoS) in lodash",
  url: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9",
  vulnerable_versions: ">=4.0.0 <4.17.21",
};
const SOME_CRITICAL: BulkAdvisory = {
  severity: "critical",
  title: "Prototype pollution",
  url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  vulnerable_versions: "<1.0.0",
};

describe("ghsaFromUrl", () => {
  it("extracts the GHSA id from a GitHub advisory URL", () => {
    expect(
      ghsaFromUrl("https://github.com/advisories/GHSA-35jh-r3h4-6jhm"),
    ).toBe("GHSA-35jh-r3h4-6jhm");
  });

  it("returns null when there is no GHSA in the url", () => {
    expect(ghsaFromUrl("https://example.com/nope")).toBeNull();
  });
});

describe("selectBlockingFindings (the gate must bite)", () => {
  it("flags HIGH and CRITICAL advisories", () => {
    const out = selectBlockingFindings(
      { lodash: [LODASH_HIGH], foo: [SOME_CRITICAL] },
      new Set(),
    );
    expect(out.map((f) => f.name).sort()).toEqual(["foo", "lodash"]);
  });

  it("drops MODERATE/low advisories (matches --audit-level=high)", () => {
    const out = selectBlockingFindings({ lodash: [LODASH_MODERATE] }, new Set());
    expect(out).toHaveLength(0);
  });

  it("drops an advisory whose GHSA is in the ignore list", () => {
    const out = selectBlockingFindings(
      { lodash: [LODASH_HIGH] },
      new Set(["GHSA-35jh-r3h4-6jhm"]),
    );
    expect(out).toHaveLength(0);
  });

  it("keeps a high advisory whose GHSA is not the one ignored", () => {
    const out = selectBlockingFindings(
      { lodash: [LODASH_HIGH] },
      new Set(["GHSA-0000-0000-0000"]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].ghsa).toBe("GHSA-35jh-r3h4-6jhm");
  });

  it("passes a clean advisory set (no findings → gate exits 0)", () => {
    expect(selectBlockingFindings({}, new Set())).toHaveLength(0);
  });
});
