// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
  update: vi.fn(async () => ({})),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, update: nav.update }),
}));
vi.mock("@/lib/observability", () => ({
  reportClientError: vi.fn(),
}));

import { TeamInviteReturn } from "../TeamInviteReturn";
import { reportClientError } from "@/lib/observability";

function respond(ok: boolean) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => ({}) }));
}

describe("return through the success page to the invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("seat: verifies the add-on, refreshes the session, then opens the invite", async () => {
    nav.params = new URLSearchParams("addon=TECHNICIAN_SEATS&next=team-invite&session_id=cs_1");
    const fetchMock = respond(true);
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamInviteReturn />);
    expect(screen.getByText(/confirming/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/dashboard/team?invite=1"),
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/api/addons/verify");
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({
      sessionId: "cs_1",
    });
    expect(nav.update).toHaveBeenCalled();
  });

  it("plan: verifies the subscription instead", async () => {
    nav.params = new URLSearchParams("next=team-invite&session_id=cs_2");
    const fetchMock = respond(true);
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamInviteReturn />);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/dashboard/team?invite=1"),
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/api/verify-subscription");
  });

  it("a verify failure shows retry, reports it, and never redirects", async () => {
    nav.params = new URLSearchParams("addon=TECHNICIAN_SEATS&next=team-invite&session_id=cs_1");
    const fetchMock = respond(false);
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamInviteReturn />);
    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    expect(reportClientError).toHaveBeenCalled();
    expect(screen.queryByText(/seat.*added/i)).not.toBeInTheDocument();

    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    fireEvent.click(retry);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/dashboard/team?invite=1"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a thrown network failure also shows retry", async () => {
    nav.params = new URLSearchParams("next=team-invite&session_id=cs_2");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<TeamInviteReturn />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("no session id is a failure, not a success", async () => {
    nav.params = new URLSearchParams("next=team-invite");
    const fetchMock = respond(true);
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamInviteReturn />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
