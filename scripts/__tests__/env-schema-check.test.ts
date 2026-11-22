import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ENV_NAMES, ENV_SCHEMA, isDeclaredEnvName, readDeclaredEnv } from "../../lib/env";
import { REQUIRED_VARS } from "../../lib/env-check";
import {
  compareEnvSchema,
  parseEnvExampleNames,
} from "../lib/env-schema-check";

/** RA-7784: .env.example and lib/env.ts ENV_SCHEMA agree in both directions. */

const repoRoot = path.resolve(__dirname, "../..");
// The only env file this test opens. Never a live env file.
const example = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf8");

describe("lib/env.ts ENV_SCHEMA vs .env.example (RA-7784)", () => {
  it("agrees with the committed .env.example", () => {
    const result = compareEnvSchema(ENV_NAMES, parseEnvExampleNames(example));
    expect(result).toEqual({ missingFromExample: [], missingFromSchema: [], exceptionErrors: [] });
  });

  it("fails when a declared name is missing from .env.example", () => {
    const planted = example
      .split("\n")
      .filter((line) => !line.startsWith("DIRECT_URL="))
      .join("\n");
    const result = compareEnvSchema(ENV_NAMES, parseEnvExampleNames(planted));
    expect(result.missingFromExample).toEqual(["DIRECT_URL"]);
    expect(result.missingFromSchema).toEqual([]);
  });

  it("fails when .env.example has a name that is not declared", () => {
    const planted = `${example}\nRA7784_PLANTED_UNDECLARED=""\n`;
    const result = compareEnvSchema(ENV_NAMES, parseEnvExampleNames(planted));
    expect(result.missingFromSchema).toEqual(["RA7784_PLANTED_UNDECLARED"]);
    expect(result.missingFromExample).toEqual([]);
  });

  it("treats commented lines as documentation, not declarations", () => {
    expect(parseEnvExampleNames('# FOO=""\n  BAR=1\nBAZ =x\nnot a line')).toEqual(["BAR", "BAZ"]);
  });

  it("honours documented exceptions and rejects unreasoned or stale ones", () => {
    const ok = compareEnvSchema(["A", "B"], ["B", "C"], {
      schemaOnly: [{ name: "A", reason: "Injected by the host at runtime." }],
      exampleOnly: [{ name: "C", reason: "Read only by an operator script." }],
    });
    expect(ok).toEqual({ missingFromExample: [], missingFromSchema: [], exceptionErrors: [] });
    const bad = compareEnvSchema(["A"], ["A"], {
      schemaOnly: [{ name: "A", reason: "x" }],
      exampleOnly: [],
    });
    expect(bad.exceptionErrors).toEqual([
      "A: exception needs a reason",
      "A: schemaOnly exception but present in .env.example (stale)",
    ]);
  });

  it("marks exactly lib/env-check.ts REQUIRED_VARS as required", () => {
    const required = ENV_NAMES.filter((n) => ENV_SCHEMA[n].required).sort();
    expect(required).toEqual([...REQUIRED_VARS].sort());
  });

  it("does not treat inherited keys as declared or configured", () => {
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(isDeclaredEnvName(key)).toBe(false);
      expect(readDeclaredEnv(key)).toBeUndefined();
    }
  });
});
