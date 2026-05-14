// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TechLicenceBanner } from "../TechLicenceBanner";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

describe("TechLicenceBanner", () => {
  it("returns null while loading (no fetch resolved)", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { container } = render(<TechLicenceBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when API response is dismissed=true", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        dismissed: true,
        allComplete: true,
        completedCount: 3,
        totalCount: 3,
        steps: [],
      }),
    });
    const { container } = render(<TechLicenceBanner />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders banner when first step id is 'tech_iicrc'", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        dismissed: false,
        allComplete: false,
        completedCount: 0,
        totalCount: 3,
        steps: [
          { id: "tech_iicrc", title: "Add your IICRC certificate", description: "...", href: "/dashboard/settings/credentials?focus=iicrc", completed: false },
          { id: "tech_whs", title: "Add your WHS card", description: "...", href: "/dashboard/settings/credentials?focus=whs", completed: false },
          { id: "tech_state", title: "Add your state licence (if applicable)", description: "...", href: "/dashboard/settings/credentials?focus=state", completed: false },
        ],
      }),
    });
    render(<TechLicenceBanner />);
    await waitFor(() =>
      expect(screen.getByText(/Add your credentials to unlock attestations/)).toBeInTheDocument(),
    );
  });

  it("returns null for non-tech step set (ADMIN/MANAGER)", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        dismissed: false,
        allComplete: false,
        completedCount: 0,
        totalCount: 4,
        steps: [
          { id: "first_inspection", title: "Create your first inspection", description: "...", href: "/dashboard/inspections/new", completed: false },
        ],
      }),
    });
    const { container } = render(<TechLicenceBanner />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
