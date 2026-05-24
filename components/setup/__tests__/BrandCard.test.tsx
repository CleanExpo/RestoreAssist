// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrandCard } from "../BrandCard";
import { useSetupStore } from "../store";

const TEST_ORG = {
  id: "org-1",
  legalName: "Acme",
  tradingName: null,
  abn: "53004085616",
  acn: null,
  state: "NSW",
  address: null,
  phone: null,
  email: null,
  website: null,
  logoUrl: null,
  primaryColor: null,
  accentColor: null,
  aboutCopy: null,
  tradingStatus: "ACTIVE" as const,
  setupStartedAt: null,
  setupCompletedAt: null,
};

describe("BrandCard", () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    useSetupStore.getState().setOrg(TEST_ORG);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { updated: [] } }),
    }) as never;
  });

  it("renders pending placeholder when status is pending", () => {
    render(<BrandCard />);
    expect(screen.getByText(/waiting for your abn/i)).toBeInTheDocument();
  });

  it("renders running skeleton when status is running", () => {
    useSetupStore.getState().setSectionStatus("branding", "running");
    render(<BrandCard />);
    expect(
      screen.getByText(/pulling your logo and brand/i),
    ).toBeInTheDocument();
  });

  it("renders editable swatches and textarea when status is ready", () => {
    useSetupStore
      .getState()
      .setOrg({ ...TEST_ORG, primaryColor: "#aabbcc", accentColor: "#ddeeff" });
    useSetupStore.getState().setSectionStatus("branding", "ready");
    render(<BrandCard />);
    expect(screen.getByLabelText(/primary colour picker/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/accent colour picker/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/about your business/i)).toBeInTheDocument();
  });

  it("PATCH /api/setup/state is called when primary colour changes", async () => {
    useSetupStore.getState().setSectionStatus("branding", "ready");
    render(<BrandCard />);
    const primary = screen.getByLabelText(/primary colour picker/i);
    fireEvent.change(primary, { target: { value: "#112233" } });
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/setup/state",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("primaryColor"),
      }),
    );
  });

  it("renders manual upload UI in manual status", () => {
    useSetupStore.getState().setSectionStatus("branding", "manual");
    render(<BrandCard />);
    expect(
      screen.getByLabelText(/upload or replace logo/i),
    ).toBeInTheDocument();
  });
});
