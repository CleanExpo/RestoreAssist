// @vitest-environment jsdom
/**
 * Mission Control read-path rendering.
 *
 * ADR 2026-09-08 D3 is the rule under test: a read that failed, was truncated,
 * or could not be accounted for must never render as a successful read of a
 * quiet board. These tests pin the three distinct renders apart — degraded and
 * empty, degraded but partially populated, and genuinely fresh — because the
 * first two are the ones a naive panel collapses into "nothing to do this week".
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import MissionControlPage from "../page";

type Routes = Record<string, { status?: number; body?: unknown }>;

const HEALTH_OK = { data: { online: true, stale: false } };
const CONTEXT_OK = {
  data: {
    fetchedAt: "2026-09-08T00:00:00.000Z",
    voice: "voice text",
    icp: "icp text",
    memorySummary: "memory text",
    wikiIndexExcerpt: "",
  },
};

const CARD = {
  id: "iss_1",
  identifier: "RA-1",
  title: "A card that exists",
  priority: 1,
  url: "https://linear.app/x/issue/RA-1",
  assignee: "Phill",
  team: "RestoreAssist",
};

function column(overrides: Record<string, unknown> = {}) {
  return {
    id: "st_1",
    name: "In Progress",
    type: "started",
    position: 1,
    cards: [CARD],
    ...overrides,
  };
}

function mountWith(routes: Routes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((key) => url.includes(key));
    const entry = match ? routes[match] : undefined;
    const status = entry?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => entry?.body ?? {},
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return render(<MissionControlPage />);
}

const BASE: Routes = {
  "/api/margot/health": { body: HEALTH_OK },
  "/api/mission-control/context": { body: CONTEXT_OK },
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Mission Control board projection", () => {
  it("shows the stale reason and no success copy when the board read failed", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": {
        body: {
          data: { columns: [] },
          fetchedAt: "2026-09-08T00:00:00.000Z",
          stale: true,
          reason: "LINEAR_API_KEY not configured",
        },
      },
      "/api/mission-control/workers": {
        body: { data: { workers: [] }, fetchedAt: "x", stale: false },
      },
    });

    expect(
      await screen.findByText(/LINEAR_API_KEY not configured/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No open cards/i)).not.toBeInTheDocument();
  });

  it("renders partial columns and the reason together when the board is truncated", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": {
        body: {
          data: { columns: [column()] },
          fetchedAt: "2026-09-08T00:00:00.000Z",
          stale: true,
          reason: "Linear board truncated",
        },
      },
      "/api/mission-control/workers": {
        body: { data: { workers: [] }, fetchedAt: "x", stale: false },
      },
    });

    expect(
      await screen.findByText(/Linear board truncated/),
    ).toBeInTheDocument();
    expect(await screen.findByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText(/RA-1/)).toBeInTheDocument();
    expect(screen.queryByText(/No open cards/i)).not.toBeInTheDocument();
  });

  it("reports a genuinely empty board as empty only when the read completed", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": {
        body: {
          data: { columns: [column({ cards: [] })] },
          fetchedAt: "2026-09-08T00:00:00.000Z",
          stale: false,
        },
      },
      "/api/mission-control/workers": {
        body: { data: { workers: [] }, fetchedAt: "x", stale: false },
      },
    });

    expect(await screen.findByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText(/No open cards/i)).toBeInTheDocument();
  });

  it("does not render an empty board when the board endpoint returns a non-ok status", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": { status: 500, body: {} },
      "/api/mission-control/workers": {
        body: { data: { workers: [] }, fetchedAt: "x", stale: false },
      },
    });

    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
    expect(screen.queryByText(/No open cards/i)).not.toBeInTheDocument();
  });
});

describe("Mission Control worker health", () => {
  it("shows the top-level reason and each worker reason", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": {
        body: {
          data: { columns: [] },
          fetchedAt: "x",
          stale: true,
          reason: "Linear fetch failed",
        },
      },
      "/api/mission-control/workers": {
        body: {
          data: {
            workers: [
              {
                name: "mini",
                url: "https://mini.local",
                online: false,
                lastHeartbeat: null,
                stale: true,
                reason: "Worker unreachable",
              },
              {
                name: "hub",
                url: "https://hub.local",
                online: true,
                lastHeartbeat: "2026-09-08T00:00:00.000Z",
                stale: false,
                uptime: 1200,
                version: "1.2.3",
              },
            ],
          },
          fetchedAt: "2026-09-08T00:00:00.000Z",
          stale: true,
          reason: "1 of 2 workers could not be confirmed online",
        },
      },
    });

    expect(
      await screen.findByText(/1 of 2 workers could not be confirmed online/),
    ).toBeInTheDocument();
    expect(screen.getByText("mini")).toBeInTheDocument();
    expect(screen.getByText(/Worker unreachable/)).toBeInTheDocument();
    expect(screen.getByText("hub")).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument();
  });

  it("survives a worker whose uptime and version are not scalars", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": {
        body: { data: { columns: [] }, fetchedAt: "x", stale: false },
      },
      "/api/mission-control/workers": {
        body: {
          data: {
            workers: [
              {
                name: "odd",
                url: "https://odd.local",
                online: true,
                lastHeartbeat: "2026-09-08T00:00:00.000Z",
                stale: false,
                uptime: { seconds: 1 },
                version: ["1", "2"],
              },
            ],
          },
          fetchedAt: "x",
          stale: false,
        },
      },
    });

    expect(await screen.findByText("odd")).toBeInTheDocument();
  });

  it("does not render workers as healthy when the workers endpoint fails", async () => {
    mountWith({
      ...BASE,
      "/api/mission-control/board": {
        body: { data: { columns: [] }, fetchedAt: "x", stale: false },
      },
      "/api/mission-control/workers": { status: 403, body: {} },
    });

    await waitFor(() =>
      expect(screen.getByText(/HTTP 403/)).toBeInTheDocument(),
    );
  });
});
