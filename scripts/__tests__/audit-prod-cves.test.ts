/**
 * Guards the prod CVE gate (scripts/audit-prod-cves.ts) that replaced the
 * retired `pnpm audit` endpoint. Fixtures use the REAL shape returned by the
 * npm bulk advisory endpoint (POST /-/npm/v1/security/advisories/bulk), so a
 * silent parser drift — which would make the gate pass everything — fails here.
 */

import { describe, expect, it } from "vitest";
import {
  collectProdDependenciesFromTree,
  collectProdDependenciesFromLockfile,
  selectBlockingFindings,
  ghsaFromUrl,
  type BulkAdvisory,
} from "../audit-prod-cves";

describe("collectProdDependenciesFromTree", () => {
  it("collects the npm ls production dependency tree without dropping nested versions", () => {
    expect(
      collectProdDependenciesFromTree({
        dependencies: {
          alpha: {
            version: "1.0.0",
            dependencies: { shared: { version: "2.0.0" } },
          },
          beta: {
            version: "3.0.0",
            dependencies: { shared: { version: "4.0.0" } },
          },
        },
      }),
    ).toEqual({
      alpha: ["1.0.0"],
      shared: ["2.0.0", "4.0.0"],
      beta: ["3.0.0"],
    });
  });
});

describe("collectProdDependenciesFromLockfile", () => {
  it("collects every locked production version and excludes dev-only packages", () => {
    expect(
      collectProdDependenciesFromLockfile({
        packages: {
          "": { version: "1.0.0" },
          "node_modules/alpha": { version: "1.0.0" },
          "node_modules/tooling": { version: "2.0.0", dev: true },
          "node_modules/alpha/node_modules/shared": { version: "3.0.0" },
          "node_modules/beta/node_modules/shared": { version: "4.0.0" },
          "node_modules/@scope/package": { version: "5.0.0" },
        },
      }),
    ).toEqual({
      alpha: ["1.0.0"],
      shared: ["3.0.0", "4.0.0"],
      "@scope/package": ["5.0.0"],
    });
  });

  it("fails closed when the lockfile has no packages map", () => {
    expect(() => collectProdDependenciesFromLockfile({})).toThrow(
      "package-lock.json has no packages map",
    );
  });
});

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
