// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-7723: the contractor profile page must fail LOUD. A 403/500 on save
// shows the server's own message on the page (role="alert"); the load banner
// shows the real error text and Retry re-fetches; a brand-new owner with no
// profile row yet sees an empty form, not a red "Failed to load" banner.

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "owner1" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/ConfirmDialog", () => ({
  useConfirmDialog: () => ({ Mount: () => null, ask: vi.fn() }),
}));

import ContractorProfileDashboard from "../page";

type Handler = (init?: RequestInit) => Response;
let routes: Record<string, Handler>;
const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function envelope(code: string, message: string, status: number) {
  return json({ error: { code, message, eventId: "evt_1" } }, status);
}

const PROFILE = {
  id: "cp1",
  publicDescription: "Water damage restoration",
  yearsInBusiness: 12,
  teamSize: 6,
  insuranceCertificate: null,
  isPubliclyVisible: true,
  specializations: ["Water damage"],
  servicesOffered: null,
  searchKeywords: [],
  isVerified: false,
  averageRating: 0,
  totalReviews: 0,
  completedJobs: 0,
};

const NOT_FOUND = () =>
  envelope("NOT_FOUND", "Contractor profile not found", 404);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected fetch ${key}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function callsTo(key: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      `${((init as RequestInit | undefined)?.method ?? "GET").toUpperCase()} ${url}` ===
      key,
  ).length;
}

describe("Contractor profile page (RA-7723)", () => {
  it("brand-new owner with no profile row sees an empty form, not a load-error banner", async () => {
    routes = {
      "GET /api/contractors/profile": () => json({ profile: null }),
      "GET /api/contractors/certifications": NOT_FOUND,
      "GET /api/contractors/service-areas": NOT_FOUND,
    };
    render(<ContractorProfileDashboard />);

    await screen.findByText("Save Profile");
    expect(screen.queryByText(/Failed to load/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("load failure shows the server's real error text in role=alert, and Retry re-fetches", async () => {
    let profileCalls = 0;
    routes = {
      "GET /api/contractors/profile": () => {
        profileCalls += 1;
        return profileCalls === 1
          ? envelope("INTERNAL", "Database temporarily unavailable", 500)
          : json({ profile: PROFILE });
      },
      "GET /api/contractors/certifications": () =>
        json({ certifications: [] }),
      "GET /api/contractors/service-areas": () => json({ serviceAreas: [] }),
    };
    render(<ContractorProfileDashboard />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database temporarily unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(callsTo("GET /api/contractors/profile")).toBe(2),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(
      screen.getByDisplayValue("Water damage restoration"),
    ).toBeInTheDocument();
  });

  it("403 on save shows the server's message on the page in role=alert", async () => {
    routes = {
      "GET /api/contractors/profile": () => json({ profile: null }),
      "GET /api/contractors/certifications": NOT_FOUND,
      "GET /api/contractors/service-areas": NOT_FOUND,
      "PUT /api/contractors/profile": () =>
        envelope(
          "FORBIDDEN",
          "Only the workspace owner can edit the contractor profile",
          403,
        ),
    };
    render(<ContractorProfileDashboard />);

    fireEvent.click(await screen.findByText("Save Profile"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Only the workspace owner can edit the contractor profile",
    );
  });

  it("500 on save shows the server's message on the page in role=alert", async () => {
    routes = {
      "GET /api/contractors/profile": () => json({ profile: PROFILE }),
      "GET /api/contractors/certifications": () =>
        json({ certifications: [] }),
      "GET /api/contractors/service-areas": () => json({ serviceAreas: [] }),
      "PUT /api/contractors/profile": () =>
        envelope("INTERNAL", "Internal server error", 500),
    };
    render(<ContractorProfileDashboard />);

    fireEvent.click(await screen.findByText("Save Profile"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Internal server error");
  });

  it("successful save shows confirmation and reloads the saved values", async () => {
    let saved = false;
    routes = {
      "GET /api/contractors/profile": () =>
        json({ profile: saved ? PROFILE : null }),
      "GET /api/contractors/certifications": () =>
        saved ? json({ certifications: [] }) : NOT_FOUND(),
      "GET /api/contractors/service-areas": () =>
        saved ? json({ serviceAreas: [] }) : NOT_FOUND(),
      "PUT /api/contractors/profile": () => {
        saved = true;
        return json({ profile: PROFILE });
      },
    };
    render(<ContractorProfileDashboard />);

    fireEvent.click(await screen.findByText("Save Profile"));

    await screen.findByText("Profile updated successfully");
    expect(
      await screen.findByDisplayValue("Water damage restoration"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
