// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ session: { data: { user: { id: "a" } }, status: "authenticated" } as any, fetch: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => h.session }));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));
import { TrialBanner } from "@/components/TrialBanner";
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", h.fetch); h.session = { data: { user: { id: "a" } }, status: "authenticated" }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("clears the old trial immediately while the next account's verified status loads", async () => {
  h.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ subscriptionStatus: "TRIAL", daysRemaining: 15, lifetimeAccess: false }) });
  const { rerender } = render(<TrialBanner />);
  await screen.findByText(/15 days left/);
  h.fetch.mockReturnValue(new Promise(() => {}));
  h.session = { data: { user: { id: "b" } }, status: "authenticated" };
  rerender(<TrialBanner />);
  expect(screen.queryByText(/15 days left/)).not.toBeInTheDocument();
  await waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2));
  h.session = { data: null, status: "unauthenticated" };
  rerender(<TrialBanner />);
  expect(screen.queryByText(/Upgrade now/)).not.toBeInTheDocument();
});
