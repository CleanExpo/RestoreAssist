import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findForbiddenClientPortalHrefs,
  PORTAL_PATHS,
} from "../recovery-paths";

const PORTAL_ROOTS = [
  join(process.cwd(), "app", "portal"),
  join(process.cwd(), "components", "portal"),
  join(process.cwd(), "lib", "portal", "client-help.ts"),
  join(process.cwd(), "lib", "portal", "recovery-paths.ts"),
];

function walkFiles(target: string, acc: string[] = []): string[] {
  const stat = statSync(target);
  if (stat.isFile()) {
    if (/\.(ts|tsx)$/.test(target) && !target.includes("__tests__")) {
      acc.push(target);
    }
    return acc;
  }
  for (const entry of readdirSync(target)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    walkFiles(join(target, entry), acc);
  }
  return acc;
}

describe("findForbiddenClientPortalHrefs", () => {
  it("goes red on contractor auth and dashboard help (control)", () => {
    const bad = `
      <a href="/dashboard/help">Help</a>
      <Link href="/login">Sign in</Link>
      <Link href="/signup">Create account</Link>
      <a href="/dashboard">Home</a>
      [Help](/help/getting-started/first-inspection)
    `;
    expect(findForbiddenClientPortalHrefs(bad)).toEqual(
      expect.arrayContaining([
        "dashboard-help",
        "contractor-login",
        "contractor-signup",
        "dashboard-root",
        "public-contractor-help",
      ]),
    );
  });

  it("does not treat /portal/login as contractor login", () => {
    expect(
      findForbiddenClientPortalHrefs(
        `<Link href="${PORTAL_PATHS.login}">Sign in</Link>`,
      ),
    ).toEqual([]);
  });

  it("proves the control file still contains /dashboard/help", () => {
    const shell = readFileSync(
      join(process.cwd(), "app", "dashboard", "DashboardShell.tsx"),
      "utf8",
    );
    expect(shell).toMatch(/\/dashboard\/help/);
    expect(findForbiddenClientPortalHrefs(shell)).toContain("dashboard-help");
  });
});

describe("client portal recovery/help sources stay on /portal/*", () => {
  const files = PORTAL_ROOTS.flatMap((root) => walkFiles(root));

  it("scans the portal surfaces this suite is meant to guard", () => {
    const relative = files.map((file) => file.replace(process.cwd() + "/", ""));
    expect(relative).toEqual(
      expect.arrayContaining([
        "app/portal/login/page.tsx",
        "app/portal/signup/page.tsx",
        "app/portal/page.tsx",
        "app/portal/[token]/page.tsx",
        "app/portal/help/page.tsx",
        "app/portal/recovery/page.tsx",
        "components/portal/PortalRecoveryCard.tsx",
        "components/portal/PortalEmptyProject.tsx",
        "components/portal/PortalLinkExpired.tsx",
        "lib/portal/client-help.ts",
      ]),
    );
  });

  it.each(files.map((file) => [file.replace(process.cwd() + "/", ""), file]))(
    "%s has no contractor auth or /dashboard/help hrefs",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(findForbiddenClientPortalHrefs(source)).toEqual([]);
    },
  );
});
