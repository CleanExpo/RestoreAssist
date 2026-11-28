// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { SimpleWalkthrough, readProgress } from "../SimpleWalkthrough";
import { AddonCardDeck, NO_VERDICT_REASON } from "../AddonCardDeck";
import { CRM_WORKS_ALONE } from "@/lib/addons/addon-guide";
import { OWNER_ONLY_REASON, TRIAL_PACK_REASON } from "@/lib/billing/addon-access";
import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";

// The signed-in account can change while a component stays mounted (sign out
// and in as someone else in the same tab), so the tests can switch it.
const session = vi.hoisted(() => ({ userId: "owner-A", role: undefined as string | undefined }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: session.userId, role: session.role } },
    status: "authenticated",
  }),
}));

const addon = (sku: string, name: string, perSeat = false) => ({
  sku,
  name,
  description: `${name} description`,
  amount: 11,
  currency: "AUD",
  interval: "month" as const,
  perSeat,
});

const trialCatalog = {
  addons: [
    addon("VOICE", "ElevenLabs Voice"),
    addon("TECHNICIAN_SEATS", "Field Technician Seat", true),
    addon("CLIENT_COMMS", "Restoration Pulse Client Comms"),
  ],
  owned: ["CLIENT_COMMS"],
  audience: "owner",
  access: {
    VOICE: { label: "unavailable", holding: "none", action: "choose_plan", reason: TRIAL_PACK_REASON },
    TECHNICIAN_SEATS: { label: "optional_paid", holding: "none", action: "buy", reason: "You can add technician seats during the free trial." },
    CLIENT_COMMS: { label: "complimentary_pilot", holding: "complimentary", action: "none", reason: "Free in your Founding Trial pilot. There is nothing to buy." },
  },
};

const teamCatalog = {
  ...trialCatalog,
  audience: "staff",
  access: {
    VOICE: { label: "optional_paid", holding: "none", action: "ask_owner", reason: OWNER_ONLY_REASON },
    TECHNICIAN_SEATS: { label: "optional_paid", holding: "none", action: "ask_owner", reason: OWNER_ONLY_REASON },
    CLIENT_COMMS: { label: "optional_paid", holding: "paid", action: "ask_owner", reason: OWNER_ONLY_REASON },
  },
};

function serve(catalog: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => catalog });
  vi.stubGlobal("fetch", fetchMock as never);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  session.userId = "owner-A";
  session.role = undefined;
});

describe("SimpleWalkthrough (RA-8466)", () => {
  it("in the iOS app shows no prices or buttons and loads nothing (App Review 3.1.1)", () => {
    for (const mode of ["setup", "reopen"] as const) {
      const fetchMock = serve(trialCatalog);
      const { container, unmount } = render(
        <ShellPlatformProvider isIosShell>
          <SimpleWalkthrough mode={mode} />
        </ShellPlatformProvider>,
      );
      expect(container.textContent ?? "").not.toMatch(/\$/);
      expect(screen.queryByRole("button")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("shows one ordinary job through the core CRM before any add-on", () => {
    serve(trialCatalog);
    render(<SimpleWalkthrough mode="setup" />);
    const keys = ["job", "evidence", "report", "invoice"];
    for (const k of keys) {
      expect(screen.getByTestId(`core-step-${k}`)).toHaveTextContent("Included");
    }
    expect(screen.getByText(CRM_WORKS_ALONE)).toBeInTheDocument();
    expect(screen.queryByTestId("guide-VOICE")).toBeNull();
    // Setup links bounce to /setup, so setup mode describes but does not link.
    expect(screen.queryByRole("link", { name: /start a job/i })).toBeNull();
  });

  it("then explains each pack with its server label, cost and limits", async () => {
    serve(trialCatalog);
    render(<SimpleWalkthrough mode="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const voice = await screen.findByTestId("guide-VOICE");
    expect(within(voice).getByTestId("guide-label-VOICE")).toHaveTextContent(
      "Not available yet",
    );
    expect(voice).toHaveTextContent(TRIAL_PACK_REASON);
    expect(voice).toHaveTextContent("$11.00 a month for the whole business, AUD GST inclusive");
    expect(voice).toHaveTextContent(/ElevenLabs key/);
    expect(voice).toHaveTextContent(/What it does not do/);

    const seats = screen.getByTestId("guide-TECHNICIAN_SEATS");
    expect(seats).toHaveTextContent("Optional, paid");
    expect(seats).toHaveTextContent("per technician seat");

    expect(screen.getByTestId("guide-label-CLIENT_COMMS")).toHaveTextContent(
      "Complimentary pilot",
    );
    // The guide never sells: no purchase buttons inside it.
    expect(screen.queryByRole("button", { name: /add pack|add a seat/i })).toBeNull();
  });

  it("RA-8665: with no verdict from the server, the guide says each pack could not be checked, for owner and staff alike", async () => {
    for (const [userId, role] of [["owner-A", "ADMIN"], ["staff-A", "USER"]]) {
      session.userId = userId;
      session.role = role;
      serve({ ...trialCatalog, access: undefined });
      const { unmount } = render(<SimpleWalkthrough mode="setup" />);
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      for (const sku of ["VOICE", "TECHNICIAN_SEATS", "CLIENT_COMMS"]) {
        expect(await screen.findByTestId(`guide-${sku}`)).toHaveTextContent(NO_VERDICT_REASON);
      }
      unmount();
    }
  });

  it("says plainly when the packs cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never);
    render(<SimpleWalkthrough mode="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the packs");
  });

  it("still skips and finishes when browser storage refuses writes", () => {
    serve(trialCatalog);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    render(<SimpleWalkthrough mode="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));
    expect(screen.getByRole("button", { name: "Resume walkthrough" })).toBeInTheDocument();
    setItem.mockRestore();
  });

  it("can be skipped, then resumed at the same step", async () => {
    serve(trialCatalog);
    const { unmount } = render(<SimpleWalkthrough mode="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));
    expect(readProgress("owner-A")).toEqual({ status: "skipped", step: 1 });
    expect(screen.getByRole("button", { name: "Resume walkthrough" })).toBeInTheDocument();

    // Leaving and coming back keeps the skip.
    unmount();
    render(<SimpleWalkthrough mode="setup" />);
    const resume = await screen.findByRole("button", { name: "Resume walkthrough" });
    fireEvent.click(resume);
    expect(await screen.findByTestId("guide-VOICE")).toBeInTheDocument();
  });

  it("finishing points to the first job and can be shown again", () => {
    serve(trialCatalog);
    render(<SimpleWalkthrough mode="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/open your first job from My Jobs/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish walkthrough" }));
    expect(readProgress("owner-A")?.status).toBe("done");
    fireEvent.click(screen.getByRole("button", { name: "Show it again" }));
    expect(screen.getByTestId("core-step-job")).toBeInTheDocument();
  });

  it("a different account signing in starts from its own progress, not the last account's", () => {
    serve(trialCatalog);
    const { rerender } = render(<SimpleWalkthrough mode="setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish walkthrough" }));
    expect(screen.getByRole("button", { name: "Show it again" })).toBeInTheDocument();

    // Account B has never seen the guide: it must start at step one.
    session.userId = "owner-B";
    rerender(<SimpleWalkthrough mode="setup" />);
    expect(screen.queryByRole("button", { name: "Show it again" })).toBeNull();
    expect(screen.getByTestId("core-step-job")).toBeInTheDocument();
    expect(readProgress("owner-B")).toBeNull();
  });

  it("reopened from Field Add-Ons, it links to the real job pages and closes", () => {
    serve(trialCatalog);
    const onClose = vi.fn();
    window.localStorage.setItem(
      "restoreassist:simple-walkthrough:owner-A",
      JSON.stringify({ status: "skipped", step: 1 }),
    );
    render(<SimpleWalkthrough mode="reopen" onClose={onClose} />);
    expect(screen.getByRole("link", { name: "Start a job" })).toHaveAttribute(
      "href",
      "/dashboard/inspections/new",
    );
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AddonCardDeck with server access (RA-8466)", () => {
  it("a team member sees labels and the reason, but no buy, add or manage control", async () => {
    serve(teamCatalog);
    render(<AddonCardDeck />);
    await screen.findByTestId("addon-card-VOICE");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link", { name: /manage|choose a plan/i })).toBeNull();
    expect(screen.getAllByText(OWNER_ONLY_REASON)).toHaveLength(3);
  });

  it("reloads the access rules when a different account signs in", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => trialCatalog })
      .mockResolvedValue({ ok: true, json: async () => teamCatalog });
    vi.stubGlobal("fetch", fetchMock as never);
    const { rerender } = render(<AddonCardDeck />);
    const seats = await screen.findByTestId("addon-card-TECHNICIAN_SEATS");
    expect(within(seats).getByRole("button", { name: "Add pack" })).toBeInTheDocument();

    // A team member now signs in: the owner's buy controls must not remain.
    session.userId = "member-B";
    rerender(<AddonCardDeck />);
    await waitFor(() => expect(screen.getAllByText(OWNER_ONLY_REASON)).toHaveLength(3));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a trial owner gets Choose a plan on a flat pack, Add pack on seats, nothing on a free pack", async () => {
    serve(trialCatalog);
    render(<AddonCardDeck />);
    const voice = await screen.findByTestId("addon-card-VOICE");
    expect(within(voice).getByRole("link", { name: "Choose a plan" })).toBeInTheDocument();
    expect(within(voice).queryByRole("button")).toBeNull();
    const seats = screen.getByTestId("addon-card-TECHNICIAN_SEATS");
    expect(within(seats).getByRole("button", { name: "Add pack" })).toBeInTheDocument();
    const comms = screen.getByTestId("addon-card-CLIENT_COMMS");
    expect(within(comms).getByText("Complimentary pilot")).toBeInTheDocument();
    expect(within(comms).queryByRole("link", { name: "Manage" })).toBeNull();
    expect(within(comms).queryByRole("button")).toBeNull();
  });

  it("sends the return target with the purchase, so checkout comes back here", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => trialCatalog })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        headers: new Headers(),
        json: async () => ({ error: { code: "CONFLICT", message: "Nothing was charged." } }),
      })
      .mockResolvedValue({ ok: true, json: async () => trialCatalog });
    vi.stubGlobal("fetch", fetchMock as never);
    render(<AddonCardDeck returnTo="setup" />);
    const seats = await screen.findByTestId("addon-card-TECHNICIAN_SEATS");
    fireEvent.click(within(seats).getByRole("button", { name: "Add pack" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toMatchObject({
      addonKey: "TECHNICIAN_SEATS",
      returnTo: "setup",
    });
  });
});
