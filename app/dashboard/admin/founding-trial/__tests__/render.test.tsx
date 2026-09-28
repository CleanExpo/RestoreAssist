// @vitest-environment jsdom
/**
 * RA-7721 review r2 — the operator page rendered through its real layout in
 * jsdom (not a browser): an allowlisted operator gets the form and, after
 * Preview, the ABR business name; a tenant ADMIN gets not-found and no form.
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPage = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  requireAdminPage: (...a: unknown[]) => requireAdminPage(...a),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import FoundingTrialLayout from "../layout";
import FoundingTrialPage from "../page";

const OPERATOR = "operator_ra7721";

async function renderAs(id: string) {
  requireAdminPage.mockResolvedValue({ id, role: "ADMIN", organizationId: "org_x" });
  const tree = await FoundingTrialLayout({ children: <FoundingTrialPage /> });
  return render(<>{tree}</>);
}

beforeEach(() => {
  requireAdminPage.mockReset();
  vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Founding Trial page, rendered through its layout", () => {
  it("a tenant ADMIN gets not-found; the form never renders", async () => {
    await expect(renderAs("tenant_admin_ra7721")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("an operator sees the form, and Preview shows the ABR business before Apply is possible", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          outcome: {
            status: "dry_run",
            entity: {
              abn: "51824753556",
              legalName: "WATERLINE RESTORATIONS PTY LTD",
              tradingNames: ["Waterline Restorations"],
            },
            result: { granted: ["VOICE", "TECHNICIAN_SEATS"], skippedPaid: [], applied: false },
            basePlan: { outcome: "extended", trialEndsAt: "2026-11-27T00:00:00.000Z" },
          },
          organizationId: "org_firm",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await renderAs(OPERATOR);

    expect(screen.getByRole("heading", { name: "Founding Trial" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ABN or organisation id"), {
      target: { value: "51 824 753 556" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("WATERLINE RESTORATIONS PTY LTD")).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      abn: "51 824 753 556",
      apply: false,
    });
    const apply = screen.getByRole("button", { name: "Apply Founding Trial" });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByLabelText("This is the right business"));
    expect(apply).toBeEnabled();

    // Apply names the previewed organisation and the identity the operator saw.
    fetchMock.mockImplementationOnce(async () =>
      new Response(
        JSON.stringify({
          outcome: {
            status: "identity_changed",
            organizationId: "org_firm",
            reason: "The business's details changed after Preview.",
          },
          organizationId: "org_firm",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    fireEvent.click(apply);
    expect(await screen.findByText(/Preview again/)).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      organizationId: "org_firm",
      apply: true,
      confirmed: {
        organizationId: "org_firm",
        abn: "51824753556",
        legalName: "WATERLINE RESTORATIONS PTY LTD",
      },
    });
    expect(screen.queryByRole("button", { name: "Apply Founding Trial" })).not.toBeInTheDocument();
  });
});
