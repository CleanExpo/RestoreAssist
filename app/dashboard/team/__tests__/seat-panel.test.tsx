// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "ADMIN",
  iosShell: false as boolean | null,
  params: new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "owner_1", role: state.role } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => state.params,
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../components/TeamActivityFeed", () => ({ default: () => null }));
vi.mock("@/components/capacitor/ShellPlatformProvider", () => ({
  useServerIosShell: () => state.iosShell,
}));

import TeamPage from "../page";
import { readInviteDraft, saveInviteDraft } from "@/lib/team/invite-draft";

const SEAT_402 = {
  ok: false,
  status: 402,
  json: async () => ({
    error: { code: "PAYMENT_REQUIRED", message: "all seats in use" },
  }),
};
const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

type Handler = (url: string, init?: RequestInit) => unknown;
function stubFetch(handlers: Record<string, Handler>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/team/members" && !handlers[url])
        return json(200, { members: [] });
      if (url === "/api/team/invites" && init?.method !== "POST")
        return json(200, { invites: [] });
      const key = init?.method === "POST" ? `POST ${url}` : url;
      return handlers[key]?.(url, init) ?? json(200, {});
    }),
  );
  return calls;
}

async function openAndSend(email = "tech@example.com") {
  render(<TeamPage />);
  fireEvent.click(await screen.findByRole("button", { name: /invite/i }));
  const input = await screen.findByPlaceholderText("colleague@example.com");
  fireEvent.change(input, { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
}

const postsTo = (calls: Array<{ url: string; init?: RequestInit }>, url: string) =>
  calls.filter((c) => c.url === url && c.init?.method === "POST");
const keyOf = (c: { init?: RequestInit }) =>
  (c.init?.headers as Record<string, string>)["Idempotency-Key"];

describe("Team page at the seat limit", () => {
  beforeEach(() => {
    state.role = "ADMIN";
    state.iosShell = false;
    state.params = new URLSearchParams();
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("keeps the entry and shows the price and a buy button to an owner", async () => {
    stubFetch({ "POST /api/team/invites": () => SEAT_402 });
    await openAndSend();
    const panel = await screen.findByRole("region", { name: /technician seat/i });
    expect(panel).toHaveTextContent("$11");
    expect(panel).toHaveTextContent(/per month/i);
    expect(
      screen.getByRole("button", { name: /buy a seat/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("colleague@example.com")).toHaveValue(
      "tech@example.com",
    );
  });

  it("saves the draft on a 402", async () => {
    stubFetch({ "POST /api/team/invites": () => SEAT_402 });
    await openAndSend();
    await screen.findByRole("region", { name: /technician seat/i });
    expect(readInviteDraft("owner_1")).toEqual({
      email: "tech@example.com",
      role: "USER",
    });
  });

  it("tells a manager to ask the owner, with no price and no button", async () => {
    state.role = "MANAGER";
    stubFetch({ "POST /api/team/invites": () => SEAT_402 });
    await openAndSend();
    const panel = await screen.findByRole("region", { name: /technician seat/i });
    expect(panel).toHaveTextContent(/ask your business owner/i);
    expect(panel).not.toHaveTextContent("$");
    expect(screen.queryByRole("button", { name: /buy a seat/i })).toBeNull();
  });

  it("shows no price or purchase in the iOS shell, on the first paint", async () => {
    state.iosShell = true;
    stubFetch({ "POST /api/team/invites": () => SEAT_402 });
    await openAndSend();
    const panel = await screen.findByRole("region", { name: /technician seat/i });
    expect(panel).not.toHaveTextContent("$");
    expect(screen.queryByRole("button", { name: /buy a seat/i })).toBeNull();
  });

  it("detects the limit by status, not by words in the message", async () => {
    stubFetch({
      "POST /api/team/invites": () =>
        json(402, { error: { code: "PAYMENT_REQUIRED", message: "email role" } }),
    });
    await openAndSend();
    expect(
      await screen.findByRole("region", { name: /technician seat/i }),
    ).toBeInTheDocument();
  });

  it("an in-place purchase re-enables Send, and Send is a fresh key and a real send", async () => {
    let inviteCount = 0;
    const calls = stubFetch({
      "POST /api/team/invites": () =>
        ++inviteCount === 1 ? SEAT_402 : json(200, { invite: { email: "tech@example.com" } }),
      "POST /api/addons/checkout": () => json(200, { updated: true, seats: 2 }),
    });
    await openAndSend();
    fireEvent.click(await screen.findByRole("button", { name: /buy a seat/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /buy a seat/i })).toBeNull(),
    );
    // Refreshing the list keeps the form mounted and moves focus to the email.
    const input = screen.getByPlaceholderText("colleague@example.com");
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
    await waitFor(() => expect(inviteCount).toBe(2));
    const posts = postsTo(calls, "/api/team/invites");
    expect(keyOf(posts[0])).not.toEqual(keyOf(posts[1]));
    await waitFor(() => expect(readInviteDraft("owner_1")).toBeNull());
  });

  it("drops the key on a refusal, so a corrected email is not a 409", async () => {
    const calls = stubFetch({ "POST /api/team/invites": () => SEAT_402 });
    await openAndSend();
    await screen.findByRole("region", { name: /technician seat/i });
    fireEvent.change(screen.getByPlaceholderText("colleague@example.com"), {
      target: { value: "other@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
    await waitFor(() => expect(postsTo(calls, "/api/team/invites")).toHaveLength(2));
    const posts = postsTo(calls, "/api/team/invites");
    expect(keyOf(posts[0])).not.toEqual(keyOf(posts[1]));
  });

  it("keeps the key across a lost response", async () => {
    let attempt = 0;
    const calls = stubFetch({
      "POST /api/team/invites": () => {
        if (++attempt === 1) throw new TypeError("network");
        return json(200, { invite: { email: "tech@example.com" } });
      },
    });
    await openAndSend();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
    await waitFor(() => expect(attempt).toBe(2));
    const posts = postsTo(calls, "/api/team/invites");
    expect(keyOf(posts[0])).toEqual(keyOf(posts[1]));
  });

  it("a first purchase saves the draft and redirects to Stripe", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, origin: "http://t" });
    const calls = stubFetch({
      "POST /api/team/invites": () => SEAT_402,
      "POST /api/addons/checkout": () =>
        json(200, { sessionId: "cs", url: "https://stripe.test/seat" }),
    });
    await openAndSend();
    fireEvent.click(await screen.findByRole("button", { name: /buy a seat/i }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://stripe.test/seat"),
    );
    const body = JSON.parse(String(postsTo(calls, "/api/addons/checkout")[0].init?.body));
    expect(body).toEqual({
      addonKey: "TECHNICIAN_SEATS",
      quantity: 1,
      returnTo: "team-invite",
      addingTechnician: true,
    });
    expect(readInviteDraft("owner_1")?.email).toBe("tech@example.com");
    vi.unstubAllGlobals();
  });

  it("a trial owner's refusal leads to the plan, then back", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, origin: "http://t" });
    const calls = stubFetch({
      "POST /api/team/invites": () => SEAT_402,
      "POST /api/addons/checkout": () =>
        json(403, { error: "Active subscription required", upgradeRequired: true }),
      "POST /api/create-checkout-session": () =>
        json(200, { sessionId: "cs", url: "https://stripe.test/plan" }),
    });
    await openAndSend();
    fireEvent.click(await screen.findByRole("button", { name: /buy a seat/i }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://stripe.test/plan"),
    );
    expect(
      JSON.parse(String(postsTo(calls, "/api/create-checkout-session")[0].init?.body)),
    ).toEqual({ plan: "monthly", returnTo: "team-invite" });
    vi.unstubAllGlobals();
  });

  it("an unpaid seat invoice shows the message and no buy button", async () => {
    stubFetch({
      "POST /api/team/invites": () => SEAT_402,
      "POST /api/addons/checkout": () =>
        json(402, { error: { code: "PAYMENT_REQUIRED", message: "unpaid invoice here" } }),
    });
    await openAndSend();
    fireEvent.click(await screen.findByRole("button", { name: /buy a seat/i }));
    expect(await screen.findByText(/unpaid invoice here/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buy a seat/i })).toBeNull();
  });

  it("portal required resyncs once and retries before offering the portal", async () => {
    let checkout = 0;
    const calls = stubFetch({
      "POST /api/team/invites": () => SEAT_402,
      "POST /api/addons/checkout": () =>
        ++checkout === 1
          ? json(403, { error: "x", upgradeRequired: true })
          : json(403, { error: "x", upgradeRequired: true }),
      "POST /api/create-checkout-session": () =>
        json(409, { error: "You already have one", portalRequired: true, url: "https://stripe.test/portal" }),
    });
    await openAndSend();
    fireEvent.click(await screen.findByRole("button", { name: /buy a seat/i }));
    const link = await screen.findByRole("link", { name: /billing portal/i });
    expect(link).toHaveAttribute("href", "https://stripe.test/portal");
    expect(calls.some((c) => c.url === "/api/subscription?refresh=true")).toBe(true);
    expect(checkout).toBe(2);
  });

  it("a server refusal shows its message", async () => {
    stubFetch({
      "POST /api/team/invites": () => SEAT_402,
      "POST /api/addons/checkout": () =>
        json(403, { error: { code: "FORBIDDEN", message: "ask them" } }),
    });
    await openAndSend();
    fireEvent.click(await screen.findByRole("button", { name: /buy a seat/i }));
    expect(await screen.findByText("ask them")).toBeInTheDocument();
  });

  it("Back from Stripe resets the buy button", async () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), origin: "http://t" });
    stubFetch({
      "POST /api/team/invites": () => SEAT_402,
      "POST /api/addons/checkout": () => json(200, { sessionId: "cs", url: "https://stripe.test/s" }),
    });
    await openAndSend();
    const buy = await screen.findByRole("button", { name: /buy a seat/i });
    fireEvent.click(buy);
    await waitFor(() => expect(buy).toBeDisabled());
    const event = new Event("pageshow") as Event & { persisted?: boolean };
    event.persisted = true;
    window.dispatchEvent(event);
    await waitFor(() => expect(buy).not.toBeDisabled());
    vi.unstubAllGlobals();
  });
});

describe("Team page returning to the invite", () => {
  beforeEach(() => {
    state.role = "ADMIN";
    state.iosShell = false;
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("invite=1 opens the form with the draft restored and focus on the email", async () => {
    saveInviteDraft("owner_1", { email: "kept@example.com", role: "USER" });
    state.params = new URLSearchParams("invite=1");
    stubFetch({});
    render(<TeamPage />);
    const input = await screen.findByPlaceholderText("colleague@example.com");
    await waitFor(() => expect(input).toHaveValue("kept@example.com"));
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("cancelled checkout says nothing was charged and keeps the entry", async () => {
    saveInviteDraft("owner_1", { email: "kept@example.com", role: "USER" });
    state.params = new URLSearchParams("invite=1&checkout=cancelled");
    stubFetch({});
    render(<TeamPage />);
    expect(await screen.findByText(/nothing was charged/i)).toBeInTheDocument();
    const input = await screen.findByPlaceholderText("colleague@example.com");
    await waitFor(() => expect(input).toHaveValue("kept@example.com"));
  });

  it("a partial send clears the draft: the invite already exists", async () => {
    saveInviteDraft("owner_1", { email: "kept@example.com", role: "USER" });
    state.params = new URLSearchParams("invite=1");
    stubFetch({
      "POST /api/team/invites": () => json(200, { partial: true, message: "saved, email failed" }),
    });
    render(<TeamPage />);
    const input = await screen.findByPlaceholderText("colleague@example.com");
    await waitFor(() => expect(input).toHaveValue("kept@example.com"));
    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
    await waitFor(() => expect(readInviteDraft("owner_1")).toBeNull());
  });

  it("a 5xx does not clear the draft", async () => {
    saveInviteDraft("owner_1", { email: "kept@example.com", role: "USER" });
    state.params = new URLSearchParams("invite=1");
    const calls = stubFetch({
      "POST /api/team/invites": () => json(500, { error: { message: "boom" } }),
    });
    render(<TeamPage />);
    const input = await screen.findByPlaceholderText("colleague@example.com");
    await waitFor(() => expect(input).toHaveValue("kept@example.com"));
    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
    await waitFor(() => expect(postsTo(calls, "/api/team/invites")).toHaveLength(1));
    await waitFor(() => expect(readInviteDraft("owner_1")?.email).toBe("kept@example.com"));
  });
});
