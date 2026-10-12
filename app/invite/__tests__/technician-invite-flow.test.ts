// @vitest-environment jsdom
/**
 * Technician invite journey, end to end through the three places it broke:
 *
 *  1. proxy.ts — with SETUP_WIZARD_ENABLED=true a Google-signed-in invitee
 *     (no setupCompletedAt) was 307'd from /invite/<token> and from the
 *     /api/invites/* calls to /setup, the owner's workspace wizard.
 *  2. /api/invites/oauth-complete — a full-page navigation that answered a
 *     mismatch / expired / invalid invite with a JSON body.
 *  3. /invite/[token] — an accepted technician (role USER) landed on the
 *     owner dashboard instead of Field Mode.
 *
 * Plain .ts (createElement, no JSX) so the Done contract path matches;
 * config/vitest.config.js now includes the app/invite test folders.
 */
import { createElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "a".repeat(48);

const {
  getToken,
  getServerSession,
  inviteFindUnique,
  push,
  signIn,
  updateSession,
  toastError,
  searchParamsRef,
} = vi.hoisted(() => ({
  getToken: vi.fn(),
  getServerSession: vi.fn(),
  inviteFindUnique: vi.fn(),
  push: vi.fn(),
  signIn: vi.fn(),
  updateSession: vi.fn(),
  toastError: vi.fn(),
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => getToken(...a) }));
vi.mock("@/lib/rate-limiter-edge", () => ({ applyRateLimitEdge: () => null }));
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { userInvite: { findUnique: (...a: unknown[]) => inviteFindUnique(...a) } },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: TOKEN }),
  useRouter: () => ({ push }),
  useSearchParams: () => searchParamsRef.current,
}));
vi.mock("next-auth/react", () => ({
  signIn,
  useSession: () => ({ update: updateSession }),
}));
vi.mock("react-hot-toast", () => ({ default: { error: toastError } }));
vi.mock("@/components/invite/InviteIdentityStep", () => ({
  InviteIdentityStep: ({ onContinue }: { onContinue: (value: unknown) => void }) =>
    createElement(
      "button",
      {
        onClick: () =>
          onContinue({
            name: "Field Technician",
            password: "not-a-real-password",
            phone: "0412345678",
            headshotDataUrl: "data:image/png;base64,AA==",
          }),
      },
      "Continue identity",
    ),
}));
vi.mock("@/components/invite/InviteTermsStep", () => ({
  InviteTermsStep: ({ onSubmit }: { onSubmit: (value: unknown) => void }) =>
    createElement(
      "button",
      { onClick: () => onSubmit({ acceptedTerms: true, acceptedChainOfCustody: true }) },
      "Accept invitation",
    ),
}));

import { proxy } from "@/proxy";
import { GET as oauthComplete } from "@/app/api/invites/oauth-complete/route";
import InviteAcceptPage from "@/app/invite/[token]/page";

describe("proxy setup gate lets the invitee through", () => {
  const prev = process.env.SETUP_WIZARD_ENABLED;
  beforeEach(() => {
    process.env.SETUP_WIZARD_ENABLED = "true";
    getToken.mockReset();
    // A Google-signed-in invitee: a session, but no workspace setup of their own.
    getToken.mockResolvedValue({ sub: "u_invitee", setupCompletedAt: null });
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SETUP_WIZARD_ENABLED;
    else process.env.SETUP_WIZARD_ENABLED = prev;
  });

  it.each([
    ["GET", `/invite/${TOKEN}`],
    ["GET", `/invite/${TOKEN}?step=2`],
    ["GET", `/api/invites/${TOKEN}`],
    ["POST", `/api/invites/${TOKEN}`],
    ["GET", `/api/invites/oauth-complete?token=${TOKEN}`],
  ])("%s %s is not redirected to /setup", async (method, path) => {
    const res = await proxy(new NextRequest(`http://localhost${path}`, { method }));
    expect(res.headers.get("location") ?? "").not.toMatch(/\/setup/);
  });

  it("still sends the invitee's other dashboard requests to /setup (control)", async () => {
    const res = await proxy(new NextRequest("http://localhost/dashboard/reports"));
    expect(res.headers.get("location")).toMatch(/\/setup$/);
  });
});

describe("GET /api/invites/oauth-complete redirects failures to the invite page", () => {
  const future = () => new Date(Date.now() + 86_400_000);
  beforeEach(() => {
    getServerSession.mockReset();
    inviteFindUnique.mockReset();
    getServerSession.mockResolvedValue({ user: { id: "u_1", email: "j@a.com" } });
  });

  function req(token?: string) {
    const q = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
    return new NextRequest(`http://localhost/api/invites/oauth-complete${q}`);
  }

  function location(res: Response) {
    const loc = res.headers.get("location");
    expect(loc).not.toBeNull();
    const url = new URL(loc!);
    return `${url.pathname}${url.search}`;
  }

  it("mismatched Google account → /invite/<token>?error=mismatch", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u_2", email: "other@example.com" } });
    inviteFindUnique.mockResolvedValue({
      id: "inv_1", email: "j@a.com", organizationId: "org_1", role: "USER",
      usedAt: null, expiresAt: future(),
    });
    const res = await oauthComplete(req(TOKEN));
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`/invite/${TOKEN}?error=mismatch`);
  });

  it("expired invite → /invite/<token>?error=expired", async () => {
    inviteFindUnique.mockResolvedValue({
      id: "inv_1", email: "j@a.com", organizationId: "org_1", role: "USER",
      usedAt: null, expiresAt: new Date(Date.now() - 1000),
    });
    const res = await oauthComplete(req(TOKEN));
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`/invite/${TOKEN}?error=expired`);
  });

  it("used invite → /invite/<token>?error=used", async () => {
    inviteFindUnique.mockResolvedValue({
      id: "inv_1", email: "j@a.com", organizationId: "org_1", role: "USER",
      usedAt: new Date(), expiresAt: future(),
    });
    const res = await oauthComplete(req(TOKEN));
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`/invite/${TOKEN}?error=used`);
  });

  it("unknown invite → /invite/<token>?error=not_found", async () => {
    inviteFindUnique.mockResolvedValue(null);
    const res = await oauthComplete(req(TOKEN));
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`/invite/${TOKEN}?error=not_found`);
  });

  it.each([[undefined], ["not-a-token"]])(
    "missing or malformed token %s → /invite/invalid?error=invalid",
    async (token) => {
      const res = await oauthComplete(req(token));
      expect(res.status).toBe(307);
      expect(location(res)).toBe("/invite/invalid?error=invalid");
    },
  );
});

describe("/invite/[token] page", () => {
  const preview = (role: string) => ({
    ok: true,
    json: async () => ({
      email: "technician@example.com",
      role,
      roleLabel: role === "USER" ? "Technician" : "Manager",
      organizationName: "Example Restoration",
      inviterName: "Admin",
      expiresAt: "2026-12-01T00:00:00.000Z",
    }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    signIn.mockResolvedValue({ ok: true });
    updateSession.mockResolvedValue({});
  });

  it("sends an accepted technician (role USER) to Field Mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(preview("USER"))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }),
    );
    render(createElement(InviteAcceptPage));
    fireEvent.click(await screen.findByRole("button", { name: "Continue identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/field"));
    expect(push).not.toHaveBeenCalledWith("/dashboard?firstRun=tech");
  });

  it("keeps the manager landing on the dashboard first-run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(preview("MANAGER"))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }),
    );
    render(createElement(InviteAcceptPage));
    fireEvent.click(await screen.findByRole("button", { name: "Continue identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?firstRun=tech"));
  });

  it("explains a Google account mismatch alongside the still-valid invite", async () => {
    searchParamsRef.current = new URLSearchParams("error=mismatch");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(preview("USER")));
    render(createElement(InviteAcceptPage));
    expect(
      await screen.findByText(/does not match the email address this invitation was sent to/i),
    ).toBeInTheDocument();
    // The invite itself is still usable — step 1 renders.
    expect(screen.getByRole("button", { name: "Continue identity" })).toBeInTheDocument();
  });

  it("explains an expired invite instead of the raw API message", async () => {
    searchParamsRef.current = new URLSearchParams("error=expired");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { code: "GONE", message: "Invite expired" } }),
      }),
    );
    render(createElement(InviteAcceptPage));
    expect(await screen.findByText(/This invitation has expired/i)).toBeInTheDocument();
  });
});
