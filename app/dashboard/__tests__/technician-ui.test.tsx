// @vitest-environment jsdom
/**
 * Technician-facing dashboard defects found walking the assigned-technician
 * journey (D-028). One describe block per surface.
 */
import { Suspense, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  toastError,
  mobileNav,
  sessionRef,
  getOfflineOwner,
  refreshOfflineOwner,
} = vi.hoisted(() => ({
  toastError: vi.fn(),
  mobileNav: vi.fn((_props: { inspectionId?: string }) => null),
  sessionRef: {
    current: { data: null as unknown, status: "loading" as string },
  },
  getOfflineOwner: vi.fn(),
  refreshOfflineOwner: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => sessionRef.current,
}));
vi.mock("@/components/mobile/MobileNav", () => ({
  MobileNav: (props: { inspectionId?: string }) => mobileNav(props),
}));
vi.mock("@/components/mobile/QuickMoistureEntry", () => ({
  QuickMoistureEntry: () => null,
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitor: () => false }));
vi.mock("@/lib/offline/account-boundary", () => ({
  getOfflineOwner: () => getOfflineOwner(),
  refreshOfflineOwner: () => refreshOfflineOwner(),
  ownsOfflineEntry: () => true,
  fetchOfflineReplay: async (_owner: unknown, url: string, init: RequestInit) =>
    fetch(url, init),
  OFFLINE_CONTEXT_EVENT: "restoreassist-offline-context",
}));
vi.mock("@/lib/offline/job-cache", () => ({
  cacheJobs: vi.fn(async () => undefined),
  getCachedJobs: vi.fn(async () => ({ jobs: [], fetchedAt: null })),
}));

import ExportPdfButton from "@/components/inspection/ExportPdfButton";
import FieldDashboardPage from "@/app/dashboard/field/page";
import InspectionsPage from "@/app/dashboard/inspections/page";
import FieldModePage from "@/app/dashboard/inspections/[id]/field/page";

// Loaded at call time so a missing module fails only the tests that need it.
const JOB_ACTIONS = "@/lib/inspections/job-actions";
async function loadJobActions(): Promise<typeof import("@/lib/inspections/job-actions")> {
  return import(/* @vite-ignore */ JOB_ACTIONS);
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OWNER = {
  userId: "tech-1",
  organizationId: "org-1",
  workspaceId: null,
  workspaceOwnerId: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  toastError.mockReset();
  mobileNav.mockClear();
  getOfflineOwner.mockReset();
  refreshOfflineOwner.mockReset();
  sessionRef.current = { data: null, status: "loading" };
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportPdfButton surfaces the API error", () => {
  it("toasts the envelope message when export-data is refused", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "FORBIDDEN", message: "Only the job owner can export this PDF" } },
        403,
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ExportPdfButton inspectionId="insp-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Export PDF/ }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Only the job owner can export this PDF"),
    );
    expect(toastError).not.toHaveBeenCalledWith("[object Object]");
  });
});

describe("inspection detail: report and dispute pack errors", () => {
  it("failedResponseMessage reads the structured envelope, never [object Object]", async () => {
    const { failedResponseMessage } = await loadJobActions();
    await expect(
      failedResponseMessage(
        jsonResponse({ error: { code: "PAYMENT_REQUIRED", message: "No credits remaining" } }, 402),
        "Report generation failed",
      ),
    ).resolves.toBe("No credits remaining");
    await expect(
      failedResponseMessage(jsonResponse({ error: "Legacy message" }, 400), "x"),
    ).resolves.toBe("Legacy message");
    await expect(
      failedResponseMessage(new Response("<html>", { status: 502 }), "Report generation failed"),
    ).resolves.toBe("Report generation failed");
  });

  it("the page's report and dispute-pack handlers use it instead of casting .error to a string", () => {
    const src = readFileSync(
      resolve(__dirname, "../inspections/[id]/page.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\(err as \{ error\?: string \}\)\.error/);
    const report = src.slice(src.indexOf("async function performGenerateReport"));
    expect(report.slice(0, 800)).toMatch(/failedResponseMessage\(/);
    const pack = src.slice(src.indexOf("async function handleGenerateDisputePack"));
    expect(pack.slice(0, 800)).toMatch(/failedResponseMessage\(/);
  });
});

describe("inspection detail: owner-only actions for an assigned technician", () => {
  it("canUseOwnerJobActions allows owners, managers and admins, not an assigned USER", async () => {
    const { canUseOwnerJobActions } = await loadJobActions();
    // Assigned technician viewing someone else's job.
    expect(canUseOwnerJobActions({ role: "USER", callerId: "tech-1", ownerId: "owner-1" })).toBe(false);
    // Unknown owner on a USER session fails closed.
    expect(canUseOwnerJobActions({ role: "USER", callerId: "tech-1", ownerId: undefined })).toBe(false);
    // A solo technician who created the job keeps their own controls.
    expect(canUseOwnerJobActions({ role: "USER", callerId: "owner-1", ownerId: "owner-1" })).toBe(true);
    expect(canUseOwnerJobActions({ role: "MANAGER", callerId: "m-1", ownerId: "owner-1" })).toBe(true);
    expect(canUseOwnerJobActions({ role: "ADMIN", callerId: "a-1", ownerId: "owner-1" })).toBe(true);
    // No session yet: hide until known.
    expect(canUseOwnerJobActions({ role: undefined, callerId: undefined, ownerId: "owner-1" })).toBe(false);
  });

  it("canGenerateDisputePack matches the route: the job owner only, whatever the role", async () => {
    const { canGenerateDisputePack } = await loadJobActions();
    expect(canGenerateDisputePack({ callerId: "owner-1", ownerId: "owner-1" })).toBe(true);
    // A manager or admin viewing another user's job gets 403 from the route.
    expect(canGenerateDisputePack({ callerId: "m-1", ownerId: "owner-1" })).toBe(false);
    expect(canGenerateDisputePack({ callerId: undefined, ownerId: undefined })).toBe(false);
  });

  it("the page gates the dispute pack on the owner, and moisture delete and progress-update toggle on owner actions", () => {
    const src = readFileSync(
      resolve(__dirname, "../inspections/[id]/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/canUseOwnerJobActions\(/);
    const guardedBefore = (marker: string) => {
      const at = src.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      return src.slice(Math.max(0, at - 1200), at);
    };
    expect(src).toMatch(/canGenerateDisputePack\(/);
    expect(guardedBefore('"Dispute Defence Pack"}')).toMatch(/disputePackAction &&/);
    expect(guardedBefore('"Dispute Defence Pack"}')).not.toMatch(/ownerActions &&/);
    expect(guardedBefore("aria-label={`Delete moisture reading for")).toMatch(/ownerActions &&/);
    expect(guardedBefore("Automatic progress updates")).toMatch(/ownerActions &&/);
    // Report and PDF stay visible to the technician (not wrapped).
    expect(guardedBefore("<ExportPdfButton inspectionId").slice(-300)).not.toMatch(/ownerActions &&/);
  });
});

describe("Field dashboard waits for the offline owner", () => {
  const JOB = {
    id: "insp-1",
    inspectionNumber: "NIR-2026-10-TECH01",
    propertyAddress: "3 Field Street, Penrith NSW 2750",
    status: "DRAFT",
    inspectionDate: "2026-10-12T00:00:00.000Z",
  };

  function routeFetch() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/inspections?")) return jsonResponse({ inspections: [JOB] });
      return jsonResponse({ criticalMissing: [], readyToLeave: false });
    });
  }

  it("refreshes the owner when online instead of showing 'Could not load jobs'", async () => {
    getOfflineOwner.mockReturnValue(null);
    refreshOfflineOwner.mockResolvedValue(OWNER);
    routeFetch();
    render(<FieldDashboardPage />);
    expect(await screen.findByText("NIR-2026-10-TECH01")).toBeInTheDocument();
    expect(refreshOfflineOwner).toHaveBeenCalled();
    expect(screen.queryByText(/Could not load jobs/)).not.toBeInTheDocument();
  });

  it("Retry refreshes the owner again", async () => {
    getOfflineOwner.mockReturnValue(null);
    refreshOfflineOwner.mockResolvedValueOnce(null).mockResolvedValue(OWNER);
    routeFetch();
    render(<FieldDashboardPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not load jobs/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    });
    expect(await screen.findByText("NIR-2026-10-TECH01")).toBeInTheDocument();
    expect(refreshOfflineOwner).toHaveBeenCalledTimes(2);
  });
});

describe("Inspections list for a technician", () => {
  it("asks for the technician's own jobs (assignee=me) when role is USER", async () => {
    sessionRef.current = {
      data: { user: { id: "tech-1", role: "USER" } },
      status: "authenticated",
    };
    fetchMock.mockResolvedValue(jsonResponse({ inspections: [] }));
    render(<InspectionsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => !u.startsWith("/api/inspections") || /[?&]assignee=me(&|$)/.test(u))).toBe(true);
    expect(urls.some((u) => /^\/api\/inspections\?(.*&)?assignee=me/.test(u))).toBe(true);
  });

  it("keeps the full list for a manager", async () => {
    sessionRef.current = {
      data: { user: { id: "m-1", role: "MANAGER" } },
      status: "authenticated",
    };
    fetchMock.mockResolvedValue(jsonResponse({ inspections: [] }));
    render(<InspectionsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // RA-8092: the list URL now carries page and limit; a manager's has no
    // assignee scope.
    const list = urls.filter((u) => u.startsWith("/api/inspections"));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((u) => !/[?&]assignee=/.test(u))).toBe(true);
  });

  it("does not fetch the unscoped list while the session is still loading", async () => {
    sessionRef.current = { data: null, status: "loading" };
    fetchMock.mockResolvedValue(jsonResponse({ inspections: [] }));
    render(<InspectionsPage />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(
      fetchMock.mock.calls
        .map((c) => String(c[0]))
        .some((u) => u.startsWith("/api/inspections")),
    ).toBe(false);
  });
});

describe("Field Mode passes the job to MobileNav", () => {
  it("renders <MobileNav inspectionId={id} />", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/inspections/insp-42") {
        return jsonResponse({
          inspection: {
            id: "insp-42",
            inspectionNumber: "NIR-2026-10-NAV042",
            propertyAddress: "42 Nav Road, Ipswich QLD 4305",
            status: "DRAFT",
            claimType: null,
            moistureReadings: [],
            classifications: [],
          },
        });
      }
      return jsonResponse({ items: [] });
    });
    const params = Promise.resolve({ id: "insp-42" });
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <FieldModePage params={params} />
        </Suspense>,
      );
    });
    await screen.findByText("NIR-2026-10-NAV042");
    expect(mobileNav).toHaveBeenCalled();
    expect(mobileNav.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ inspectionId: "insp-42" }),
    );
  });
});
