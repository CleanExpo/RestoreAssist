import { describe, expect, it } from "vitest";
import {
  isManagerOrAdminRole,
  workspaceHubLinks,
  WORKSPACE_LINKS,
} from "../dashboard/workspace-secondary-links";

describe("workspaceHubLinks", () => {
  it("includes simple-nav destinations", () => {
    const hrefs = workspaceHubLinks().map((l) => l.href);
    expect(hrefs).toContain(WORKSPACE_LINKS.reports.href);
    expect(hrefs).toContain(WORKSPACE_LINKS.bill.href);
    expect(hrefs).toContain(WORKSPACE_LINKS.help.href);
  });

  it("omits the current page and optionally adds inbox", () => {
    const reports = workspaceHubLinks({ omitHref: WORKSPACE_LINKS.reports.href });
    expect(reports.some((l) => l.href === WORKSPACE_LINKS.reports.href)).toBe(
      false,
    );
    const withInbox = workspaceHubLinks({ includeCompletenessInbox: true });
    expect(withInbox.some((l) => l.href === WORKSPACE_LINKS.inbox.href)).toBe(
      true,
    );
  });
});

describe("isManagerOrAdminRole", () => {
  it("recognises manager and admin", () => {
    expect(isManagerOrAdminRole("MANAGER")).toBe(true);
    expect(isManagerOrAdminRole("ADMIN")).toBe(true);
    expect(isManagerOrAdminRole("USER")).toBe(false);
  });
});
