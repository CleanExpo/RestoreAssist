// @vitest-environment jsdom
/**
 * RA-8111 step 2 — the wizard must not treat "configured" as "working".
 * The health route contacts no provider, so the wizard may not claim success
 * from it, and may not send a lookup to a third-party listing site while the
 * source permission (RA-6850) is unverified.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PropertyDataSetupWizard } from "@/components/property-data/PropertyDataSetupWizard";

const UNVERIFIED = "unverified (legal gate RA-6850)";
const fetchMock = vi.fn();

function healthBody(featureEnabled: "on" | "off") {
  return {
    status: "configured_unverified",
    configured: true,
    verified: false,
    checks: {
      configured: "ok",
      providerReachable: UNVERIFIED,
      planAvailable: UNVERIFIED,
      sourcePermitted: UNVERIFIED,
      featureEnabled,
    },
  };
}

function openTestStep() {
  render(<PropertyDataSetupWizard onClose={vi.fn()} onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Test Connection$/ }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PropertyDataSetupWizard health reading", () => {
  for (const featureEnabled of ["on", "off"] as const) {
    it(`reports not verified and sends no lookup when health is configured only (feature ${featureEnabled})`, async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => healthBody(featureEnabled),
      });
      openTestStep();

      await screen.findByText(/Not verified/);
      expect(screen.queryByText(/ready to use/i)).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/properties/scrape/health");
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          featureEnabled === "off" ? /switched off/ : /source permission and provider reachability are unverified/,
        ),
      );
    });
  }
});
