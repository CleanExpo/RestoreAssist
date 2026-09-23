/**
 * RA-7660 (One CRM, Unit A1) — the five listing switches default OFF.
 *
 * Each helper takes the raw env value as an argument (defaulting to its own
 * literal `process.env.NEXT_PUBLIC_*` read, which is what Next.js inlines into
 * the browser bundle). Only an explicit 1 / true / on opens a switch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as flags from "../one-crm-flags";

const HELPERS = [
  ["isNrpgEnabled", "NEXT_PUBLIC_NRPG_ENABLED"],
  ["isServiceM8Enabled", "NEXT_PUBLIC_SERVICEM8_ENABLED"],
  ["isMyobEnabled", "NEXT_PUBLIC_MYOB_ENABLED"],
  ["isQuickBooksEnabled", "NEXT_PUBLIC_QUICKBOOKS_ENABLED"],
  ["isImportDataEnabled", "NEXT_PUBLIC_IMPORT_DATA_ENABLED"],
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(HELPERS)("%s (%s)", (name, envName) => {
  const helper = () =>
    (flags as unknown as Record<string, (raw?: string) => boolean>)[name];

  it("is exported as a function", () => {
    expect(typeof helper()).toBe("function");
  });

  it.each([undefined, "", "   ", "false", "0", "off", "no", "yes", "enabled"])(
    "stays off for %j",
    (raw) => {
      expect(helper()(raw)).toBe(false);
    },
  );

  it.each(["1", "true", "on", " TRUE ", "On"])("opens for %j", (raw) => {
    expect(helper()(raw)).toBe(true);
  });

  it("defaults off when the variable is unset", () => {
    vi.stubEnv(envName, "");
    expect(helper()()).toBe(false);
  });

  it("reads its own variable when called with no argument", () => {
    vi.stubEnv(envName, "true");
    expect(helper()()).toBe(true);
  });
});
