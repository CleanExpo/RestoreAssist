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
import { isValidAbn } from "@/lib/abn/checksum";

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
  // The placeholder was the ATO's real ABN (51 824 753 556). An example that
  // fails the ABN checksum can never be issued to a real business.
  it("uses an ABN placeholder that can never be a real ABN", async () => {
    await renderAs(OPERATOR);
    const input = screen.getByLabelText("ABN or organisation id");
    const digits = (input.getAttribute("placeholder") ?? "").replace(/\D/g, "");
    expect(digits).toHaveLength(11);
    expect(isValidAbn(digits)).toBe(false);
  });

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

  it("P1-REPREVIEW-REUSES-CONFIRMATION: a second Preview clears the tick; Apply then sends the business re-ticked, not the old one", async () => {
    const dryRun = (entity: { abn: string; legalName: string }) =>
      new Response(
        JSON.stringify({
          organizationId: "org_firm",
          outcome: {
            status: "dry_run",
            entity: { ...entity, tradingNames: [] },
            result: { granted: ["VOICE"], skippedPaid: [], applied: false },
            basePlan: { outcome: "extended", trialEndsAt: "2026-11-27T00:00:00.000Z" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const A = { abn: "51824753556", legalName: "FIRST PTY LTD" };
    const B = { abn: "33102417032", legalName: "OTHER PTY LTD" };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => dryRun(A))
      .mockImplementationOnce(async () => dryRun(B))
      .mockImplementation(async () =>
        new Response(JSON.stringify({ organizationId: "org_firm", outcome: { status: "granted" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await renderAs(OPERATOR);
    fireEvent.change(screen.getByLabelText("ABN or organisation id"), { target: { value: "org_firm" } });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("FIRST PTY LTD");
    fireEvent.click(screen.getByLabelText("This is the right business"));
    expect(screen.getByRole("button", { name: "Apply Founding Trial" })).toBeEnabled();

    // Same lookup, previewed again: the business behind it is now B.
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("OTHER PTY LTD");
    expect(screen.getByLabelText("This is the right business")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Apply Founding Trial" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("This is the right business"));
    const apply = screen.getByRole("button", { name: "Apply Founding Trial" });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      organizationId: "org_firm",
      apply: true,
      confirmed: { organizationId: "org_firm", ...B },
    });
  });
});

describe("Founding Trial page - founder override", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const REASON = "Founder approved: ABR lookup failed at signup.";

  it("RA-8664: an overridable refusal offers a reason box; the override Preview and Apply both carry the reason", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        json(
          {
            organizationId: "org_drc",
            outcome: {
              status: "unverified_abn",
              organizationId: "org_drc",
              reason: "The Australian Business Register has not confirmed this business's ABN.",
              overridable: true,
            },
          },
          422,
        ),
      )
      .mockImplementationOnce(async () =>
        json({
          organizationId: "org_drc",
          outcome: {
            status: "dry_run",
            entity: {
              abn: "51824753556",
              legalName: "DRC (NSW) Pty Ltd",
              tradingNames: [],
              source: "founder_override",
            },
            result: { granted: ["VOICE"], skippedPaid: [], applied: false },
            basePlan: { outcome: "extended", trialEndsAt: "2027-01-27T00:00:00.000Z" },
          },
        }),
      )
      .mockImplementation(async () =>
        json({
          organizationId: "org_drc",
          outcome: {
            status: "granted",
            entity: {
              abn: "51824753556",
              legalName: "DRC (NSW) Pty Ltd",
              tradingNames: [],
              source: "founder_override",
            },
            result: { granted: ["VOICE"], skippedPaid: [], applied: true },
            basePlan: { outcome: "extended", trialEndsAt: "2027-01-27T00:00:00.000Z" },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await renderAs(OPERATOR);
    fireEvent.change(screen.getByLabelText("ABN or organisation id"), {
      target: { value: "51824753556" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const box = await screen.findByLabelText("Founder override reason");
    const overridePreview = screen.getByRole("button", { name: "Preview with founder override" });
    expect(overridePreview).toBeDisabled();
    fireEvent.change(box, { target: { value: REASON } });
    expect(overridePreview).toBeEnabled();
    fireEvent.click(overridePreview);

    expect(await screen.findByText(/Founder\s+override; the reason is recorded/)).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      abn: "51824753556",
      apply: false,
      override: { reason: REASON },
    });

    fireEvent.click(screen.getByLabelText("This is the right business"));
    fireEvent.click(screen.getByRole("button", { name: "Apply Founding Trial" }));
    expect(await screen.findByText("Granted.")).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      organizationId: "org_drc",
      apply: true,
      confirmed: { organizationId: "org_drc", abn: "51824753556", legalName: "DRC (NSW) Pty Ltd" },
      override: { reason: REASON },
    });
  });

  it("control: a refusal that cannot be overridden offers no reason box", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            organizationId: "org_x",
            outcome: {
              status: "unverified_abn",
              organizationId: "org_x",
              reason: "The Australian Business Register lists this ABN as cancelled.",
              overridable: false,
            },
          },
          422,
        ),
      ),
    );
    await renderAs(OPERATOR);
    fireEvent.change(screen.getByLabelText("ABN or organisation id"), {
      target: { value: "51824753556" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/lists this ABN as cancelled/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Founder override reason")).not.toBeInTheDocument();
  });

  it("RA-8664b: a preview checked against the database, because Stripe refused the key, says so", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          outcome: {
            status: "dry_run",
            billingCheckedBy: "database",
            entity: {
              abn: "51824753556",
              legalName: "WATERLINE RESTORATIONS PTY LTD",
              tradingNames: [],
            },
            result: { granted: ["VOICE"], skippedPaid: [], applied: false },
            basePlan: { outcome: "extended", trialEndsAt: "2026-11-27T00:00:00.000Z" },
          },
          organizationId: "org_firm",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await renderAs(OPERATOR);
    fireEvent.change(screen.getByLabelText("ABN or organisation id"), {
      target: { value: "51 824 753 556" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      await screen.findByText(
        /Stripe refused the current API key, so add-on billing was checked against RestoreAssist's own records: no Stripe billing on record for this business\./,
      ),
    ).toBeInTheDocument();
  });
});

describe("Founding Trial page - what the business holds now", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const NINE = [
    "VOICE",
    "TECHNICIAN_SEATS",
    "BOOKKEEPING",
    "SERVICE_CRM",
    "PAYMENTS",
    "FLOORPLAN_UNDERLAY",
    "CLIENT_COMMS",
    "CLIENT_EDUCATION",
    "AI_COPILOT",
  ];
  const GRANTED = {
    workspaceId: "ws_drc",
    activeAddons: NINE,
    foundingTrialAddons: NINE,
    paidAddons: [],
    owner: { subscriptionStatus: "TRIAL", trialEndsAt: "2027-01-28T03:00:00.000Z" },
    founderOverride: { recordedAt: "2026-11-29T01:00:00.000Z" },
  };
  const ALREADY =
    "Already on the Founding Trial: 9 add-ons free, base plan free until 28 January 2027 (founder override recorded).";

  beforeEach(() => {
    // Only Date is faked, so "free until" is judged against 29/11/2026 and
    // the test does not change meaning after 28/01/2027.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-29T02:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  async function preview(body: unknown, status: number) {
    const fetchMock = vi.fn(async () => json(body, status));
    vi.stubGlobal("fetch", fetchMock);
    await renderAs(OPERATOR);
    fireEvent.change(screen.getByLabelText("ABN or organisation id"), {
      target: { value: "28 614 802 425" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    return fetchMock;
  }

  it("a granted business whose ABN is unconfirmed shows the grant in place, and the override still works", async () => {
    await preview(
      {
        organizationId: "org_drc",
        current: GRANTED,
        outcome: {
          status: "unverified_abn",
          organizationId: "org_drc",
          reason: "The Australian Business Register has not confirmed this business's ABN.",
          overridable: true,
        },
      },
      422,
    );
    const state = await screen.findByRole("status", { name: "Current Founding Trial state" });
    expect(state).toHaveTextContent(ALREADY);
    expect(screen.queryByText(/^Not granted\./)).not.toBeInTheDocument();
    expect(screen.getByText(/A new grant cannot run from this Preview\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Founder override reason")).toBeInTheDocument();
  });

  it("a granted business whose ABN is confirmed shows the grant in place above the dry run", async () => {
    await preview(
      {
        organizationId: "org_drc",
        current: GRANTED,
        outcome: {
          status: "dry_run",
          entity: { abn: "28614802425", legalName: "DRC (NSW) PTY LTD", tradingNames: [] },
          result: { granted: NINE, skippedPaid: [], applied: false },
          basePlan: { outcome: "extended", trialEndsAt: "2027-01-28T03:00:00.000Z" },
        },
      },
      200,
    );
    const state = await screen.findByRole("status", { name: "Current Founding Trial state" });
    expect(state).toHaveTextContent(ALREADY);
    expect(screen.getByRole("button", { name: "Apply Founding Trial" })).toBeDisabled();
  });

  it("control: a never-granted business reads as not on the trial, and the refusal still says Not granted", async () => {
    await preview(
      {
        organizationId: "org_new",
        current: {
          workspaceId: "ws_new",
          activeAddons: [],
          foundingTrialAddons: [],
          paidAddons: [],
          owner: { subscriptionStatus: "EXPIRED", trialEndsAt: "2026-10-15T00:00:00.000Z" },
          founderOverride: null,
        },
        outcome: {
          status: "unverified_abn",
          organizationId: "org_new",
          reason: "The Australian Business Register has not confirmed this business's ABN.",
          overridable: true,
        },
      },
      422,
    );
    const state = await screen.findByRole("status", { name: "Current Founding Trial state" });
    expect(state).toHaveTextContent(
      "Not on the Founding Trial now: no add-ons held free, base plan trial ended 15 October 2026.",
    );
    expect(screen.getByText(/Not granted\./)).toBeInTheDocument();
  });

  it("a failed read is said plainly, never shown as an empty state", async () => {
    await preview(
      {
        organizationId: "org_drc",
        current: null,
        currentError:
          "What this business holds now could not be read, so this Preview cannot say whether it is already on the Founding Trial.",
        outcome: {
          status: "unverified_abn",
          organizationId: "org_drc",
          reason: "The Australian Business Register has not confirmed this business's ABN.",
          overridable: true,
        },
      },
      422,
    );
    expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Current Founding Trial state" }),
    ).not.toBeInTheDocument();
  });
});
