// @vitest-environment jsdom
/**
 * RA-8078 — the cloud mirror picker must never tell a user OneDrive is
 * connected or mirroring while no code path copies files there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const { CloudMirrorPicker } = await import("../cloud-mirror-picker");

type Entry = { id: string; label: string; tagline: string; enabled: boolean };

function mockCatalog(onedriveEnabled: boolean, provider = "drive") {
  const catalog: Entry[] = [
    { id: "drive", label: "Google Drive", tagline: "Drive", enabled: true },
    {
      id: "onedrive",
      label: "Microsoft OneDrive",
      tagline: "Coming soon",
      enabled: onedriveEnabled,
    },
    { id: "icloud", label: "Apple iCloud", tagline: "CloudKit", enabled: false },
  ];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ provider, catalog }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CloudMirrorPicker — OneDrive", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not claim OneDrive is connected when the catalog does not offer it", async () => {
    searchParams = new URLSearchParams("onedrive=connected");
    mockCatalog(false);
    render(<CloudMirrorPicker />);
    await waitFor(() => screen.getByLabelText(/microsoft onedrive/i));
    expect(screen.getByLabelText(/microsoft onedrive/i)).toBeDisabled();
    expect(screen.queryByText(/onedrive connected/i)).not.toBeInTheDocument();
  });

  it("a saved OneDrive choice that is switched off is not shown as current", async () => {
    // A user who saved OneDrive while it was offered, before RA-8078 hid it.
    mockCatalog(false, "onedrive");
    render(<CloudMirrorPicker />);
    const radio = await waitFor(() => screen.getByLabelText(/microsoft onedrive/i));
    expect(radio).not.toBeChecked();
    expect(screen.queryByText(/currently using/i)).not.toBeInTheDocument();
  });

  it("still shows an enabled saved choice as current", async () => {
    mockCatalog(false, "drive");
    render(<CloudMirrorPicker />);
    await waitFor(() => screen.getByText(/currently using/i));
    expect(screen.getByLabelText(/google drive/i)).toBeChecked();
  });

  it("Save with OneDrive selected posts the choice instead of redirecting to the Microsoft login", async () => {
    const fetchMock = mockCatalog(true);
    render(<CloudMirrorPicker />);
    const radio = await waitFor(() => screen.getByLabelText(/microsoft onedrive/i));
    fireEvent.click(radio);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ provider: "onedrive" });
    expect(window.location.href).not.toMatch(/microsoft-onedrive\/start/);
  });
});
