// @vitest-environment jsdom
/**
 * RA-8432 — the job page's "Quick navigation" row must not offer a person a
 * page the server will refuse them.
 *
 * The discovering test reads the hrefs the row actually renders, for every
 * role and every shape of job, and checks each one against the rule owners:
 * `DASHBOARD_PAGE_ACCESS` / `canOpenDashboardPage` for owner pages, and
 * `canWriteFinancialRecords` for the new-invoice form (POST /api/invoices
 * calls assertFinancialWriter, which reads the same role list). Neither the
 * guarded pages nor the roles are typed here, so a new guarded page or a new
 * link is covered without editing this file.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectionWorkspaceLinks } from "../InspectionWorkspaceLinks";
import {
  DASHBOARD_PAGE_ACCESS,
  canOpenDashboardPage,
  type GuardedDashboardPage,
} from "@/lib/auth/dashboard-page-rules";
import {
  FINANCIAL_WRITER_ROLES,
  canWriteFinancialRecords,
} from "@/lib/auth/financial-writer-roles";

afterEach(cleanup);

const NEW_INVOICE_PATH = "/dashboard/invoices/new";

/** Every role the rule owners name, plus a missing role (still loading). */
const ROLES: (string | undefined)[] = [
  ...new Set([
    ...Object.values(DASHBOARD_PAGE_ACCESS).flat(),
    ...FINANCIAL_WRITER_ROLES,
    "USER",
  ]),
  undefined,
];

const JOB_SHAPES = [
  { clientId: null, reportId: null },
  { clientId: "client-1", reportId: null },
  { clientId: null, reportId: "report-1" },
  { clientId: "client-1", reportId: "report-1" },
];

function renderedLinks(role: string | undefined, shape: (typeof JOB_SHAPES)[number]) {
  const { container, unmount } = render(
    <InspectionWorkspaceLinks inspectionId="insp-1" role={role} {...shape} />,
  );
  const links = [...container.querySelectorAll("a")].map((a) => ({
    label: a.textContent?.trim() ?? "",
    path: (a.getAttribute("href") ?? "").split("?")[0],
  }));
  unmount();
  return links;
}

function ownerAllows(role: string | undefined, path: string): boolean | null {
  if (path in DASHBOARD_PAGE_ACCESS) {
    return canOpenDashboardPage(role, path as GuardedDashboardPage);
  }
  if (path === NEW_INVOICE_PATH) return canWriteFinancialRecords(role);
  return null; // not a guarded destination
}

describe("InspectionWorkspaceLinks — every link passes its rule owner (RA-8432)", () => {
  it("renders no link to a guarded page the role cannot use", () => {
    const refused: string[] = [];
    for (const role of ROLES) {
      for (const shape of JOB_SHAPES) {
        for (const { label, path } of renderedLinks(role, shape)) {
          if (ownerAllows(role, path) === false) {
            refused.push(`${role ?? "(no role)"}: "${label}" -> ${path}`);
          }
        }
      }
    }
    expect([...new Set(refused)]).toEqual([]);
  });

  it("still offers each guarded link to a role the owner allows", () => {
    // Guards against the trivial fix of hiding guarded links from everyone.
    const shown = new Set<string>();
    for (const role of ROLES) {
      for (const shape of JOB_SHAPES) {
        for (const { path } of renderedLinks(role, shape)) {
          if (ownerAllows(role, path) === true) shown.add(path);
        }
      }
    }
    expect(shown.has(NEW_INVOICE_PATH)).toBe(true);
    expect(shown.has("/dashboard/subscription")).toBe(true);
  });
});

describe("InspectionWorkspaceLinks — what each role sees", () => {
  const base = { inspectionId: "insp-1", clientId: "client-1", reportId: null };

  it("a technician (USER) sees neither billing link", () => {
    render(<InspectionWorkspaceLinks {...base} role="USER" />);
    expect(screen.queryByRole("link", { name: /Get a Bill Out/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Account & Billing/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Completeness inbox/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Help/ })).toBeInTheDocument();
  });

  it("a manager sees Get a Bill Out but not Account & Billing", () => {
    render(<InspectionWorkspaceLinks {...base} role="MANAGER" />);
    expect(screen.getByRole("link", { name: /Get a Bill Out/ })).toHaveAttribute(
      "href",
      `${NEW_INVOICE_PATH}?clientId=client-1&inspectionId=insp-1`,
    );
    expect(screen.queryByRole("link", { name: /Account & Billing/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Completeness inbox/ })).toBeInTheDocument();
  });

  it("an owner (ADMIN) sees both", () => {
    render(<InspectionWorkspaceLinks {...base} role="ADMIN" />);
    expect(screen.getByRole("link", { name: /Get a Bill Out/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Account & Billing/ })).toHaveAttribute(
      "href",
      "/dashboard/subscription",
    );
  });

  it("with no role yet (session loading) shows no guarded link", () => {
    render(<InspectionWorkspaceLinks {...base} />);
    expect(screen.queryByRole("link", { name: /Get a Bill Out/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Account & Billing/ })).toBeNull();
  });
});
