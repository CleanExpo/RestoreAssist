/**
 * RA-8356: the sender register is an allow-list. A new sender or a new direct
 * send site that nobody classified fails here, so a sales email cannot skip
 * the opt-out check by never being listed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DIRECT_SEND_SITES,
  EMAIL_SENDERS,
} from "@/lib/email/sender-register";

const ROOT = path.resolve(__dirname, "../../..");

/** The email plumbing itself; everything else that sends must be listed. */
const INFRASTRUCTURE = new Set([
  "lib/email.ts",
  "lib/email-send.ts",
  "lib/email/send-transactional.ts",
]);

const SCAN_DIRS = ["app", "lib", "scripts"];
const SOURCE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;

/** Remove block and line comments so a mention in prose is not a call. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function exportedSenders(source: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /^export\s+(?:async\s+)?function\s+(send\w*)\s*\(/gm,
    /^export\s+const\s+(send\w*)\s*=/gm,
  ];
  for (const pattern of patterns) {
    for (const match of stripComments(source).matchAll(pattern)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

function callsSendDirectly(source: string): boolean {
  return /\b(?:sendEmail|sendTransactionalEmail)\s*\(/.test(
    stripComments(source),
  );
}

/**
 * Wording that asks the reader to buy, resume or upgrade. Review round 1
 * found a "service" email with a Resubscribe Now button; promotional content
 * inside a service email makes it commercial, so a service sender whose body
 * carries any of these must be reclassed "sales" (and get the opt-out).
 * A word list is a known limit: it catches the wording this codebase uses,
 * not every way to sell.
 */
const SALES_WORDING =
  /resubscribe|subscribe now|upgrade|come back|reactivate|special offer|discount|\d+\s*% off/i;

/** The source of one exported sender, up to the next export. */
function senderBody(source: string, name: string): string {
  const clean = stripComments(source);
  const start = clean.search(
    new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s+const\\s+${name}\\s*=`,
    ),
  );
  if (start < 0) return "";
  const next = clean.indexOf("\nexport ", start + 1);
  return clean.slice(start, next < 0 ? undefined : next);
}

function salesWordingIn(body: string): string | null {
  const hit = body.match(SALES_WORDING);
  return hit ? hit[0] : null;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith("."))
      continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_FILE.test(name) && !/\.(test|spec)\./.test(name))
      out.push(full);
  }
}

function directSendSitesOnDisk(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir), files);
  return files
    .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
    .filter((rel) => !INFRASTRUCTURE.has(rel))
    .filter((rel) => callsSendDirectly(readFileSync(path.join(ROOT, rel), "utf8")))
    .sort();
}

describe("email sender register (RA-8356)", () => {
  it("lists exactly the senders lib/email.ts exports", () => {
    const onDisk = exportedSenders(
      readFileSync(path.join(ROOT, "lib/email.ts"), "utf8"),
    );
    expect(onDisk.length).toBeGreaterThan(10);
    expect(Object.keys(EMAIL_SENDERS).sort()).toEqual(onDisk);
  });

  it("lists exactly the files that call a send function directly", () => {
    const onDisk = directSendSitesOnDisk();
    expect(onDisk.length).toBeGreaterThan(0);
    expect(Object.keys(DIRECT_SEND_SITES).sort()).toEqual(onDisk);
  });

  it("gives every row a reason", () => {
    for (const row of [
      ...Object.values(EMAIL_SENDERS),
      ...Object.values(DIRECT_SEND_SITES),
    ]) {
      expect(row.why.trim().length).toBeGreaterThan(10);
    }
  });

  it("keeps sales wording out of every service email", () => {
    const source = readFileSync(path.join(ROOT, "lib/email.ts"), "utf8");
    const offenders: string[] = [];
    for (const [name, row] of Object.entries(EMAIL_SENDERS)) {
      if (row.class !== "service") continue;
      const body = senderBody(source, name);
      expect(body.length, `${name} found in lib/email.ts`).toBeGreaterThan(0);
      const hit = salesWordingIn(body);
      if (hit) offenders.push(`${name}: "${hit}"`);
    }
    expect(offenders).toEqual([]);
  });

  it("never classes a direct send site as sales", () => {
    for (const row of Object.values(DIRECT_SEND_SITES)) {
      expect(["service", "internal"]).toContain(row.class);
    }
  });
});

describe("register scanners catch what they claim to (controls)", () => {
  it("finds a new exported sender", () => {
    const source =
      "export async function sendOld() {}\nexport async function sendNewOfferEmail(d) {}\n";
    expect(exportedSenders(source)).toEqual(["sendNewOfferEmail", "sendOld"]);
  });

  it("ignores a sender that only appears in a comment", () => {
    expect(exportedSenders("// export async function sendGhost() {}\n")).toEqual(
      [],
    );
  });

  it("finds sales wording in a sender body and stops at the next export", () => {
    const source =
      'export async function sendA(d) { const h = "Resubscribe Now"; }\n' +
      'export async function sendB(d) { const h = "Your receipt"; }\n';
    expect(salesWordingIn(senderBody(source, "sendA"))).toBe("Resubscribe");
    expect(salesWordingIn(senderBody(source, "sendB"))).toBeNull();
    expect(senderBody(source, "sendMissing")).toBe("");
  });

  it("ignores sales wording that only appears in a comment", () => {
    const source =
      'export async function sendC(d) {\n  // upgrade later\n  const h = "Done";\n}\n';
    expect(salesWordingIn(senderBody(source, "sendC"))).toBeNull();
  });

  it("sees a direct call but not a call written in a comment", () => {
    expect(callsSendDirectly("await sendEmail({ to })")).toBe(true);
    expect(callsSendDirectly("await sendTransactionalEmail ({ to })")).toBe(
      true,
    );
    expect(callsSendDirectly("/* sendEmail(x) */ // sendEmail(y)")).toBe(false);
  });
});
