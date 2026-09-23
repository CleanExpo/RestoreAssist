// @vitest-environment jsdom
/**
 * RA-7711 (A) — Quick Fill fills the FORM only.
 *
 * Observed live 2026-09-23: Quick Fill left the claim type and the water
 * category/class empty, so the job it produced was unclassified. The form also
 * auto-creates an inspection (POST /api/inspections, which can also create a
 * shell DRAFT report) 1.5 s after claim type + address + postcode are all
 * filled. Once Quick Fill sets the claim type, that timer would turn every
 * Quick Fill into a real job on the account unless it is held back.
 *
 * This control fails when Quick Fill leaves the classification empty, and
 * fails when Quick Fill on its own causes any request that creates an
 * inspection, a report or a client.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("@/lib/capacitor", () => ({
  isCapacitorIOS: () => false,
  getCurrentLocation: vi.fn(),
  fireHaptic: vi.fn(),
  scheduleFollowUpReminder: vi.fn(),
}));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

type Call = { url: string; method: string };
const calls: Call[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CREATING = /\/api\/(inspections|reports|clients)(\/|\?|$)/;

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (url.includes("/api/user/quick-fill-credits")) {
        return jsonResponse({ hasUnlimited: true, creditsRemaining: 0 });
      }
      if (url.includes("/api/inspections") && method === "POST") {
        return jsonResponse({ inspection: { id: "insp-created" } }, 201);
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function quickFill(templateName: string) {
  render(<NIRTechnicianInputForm />);
  const button = await screen.findByRole("button", { name: /^Quick Fill$/ });
  await act(async () => {
    fireEvent.click(button);
  });
  const template = await screen.findByRole("button", {
    name: new RegExp(templateName),
  });
  await act(async () => {
    fireEvent.click(template);
  });
}

describe("RA-7711 Quick Fill fills the form only", () => {
  it("sets the claim type and the water category/class from the template", async () => {
    await quickFill("Residential Burst Pipe");

    expect(
      screen.getByRole("radio", { name: "Water Damage (IICRC S500:2021)" }),
    ).toHaveAttribute("aria-checked", "true");

    const category = document.querySelector<HTMLInputElement>(
      'input[name="waterCategory"][value="1"]',
    );
    const waterClass = document.querySelector<HTMLInputElement>(
      'input[name="waterClass"][value="2"]',
    );
    expect(category, "water category radio not rendered").not.toBeNull();
    expect(waterClass, "water class radio not rendered").not.toBeNull();
    expect(category!.checked).toBe(true);
    expect(waterClass!.checked).toBe(true);
  });

  it("makes no request that creates an inspection, report or client", async () => {
    await quickFill("Residential Burst Pipe");

    // Outlast the 1.5 s auto-create debounce.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2000));
    });

    const writes = calls.filter(
      (c) => c.method !== "GET" && CREATING.test(c.url),
    );
    expect(writes).toEqual([]);
  });

  it("still creates the job once the technician edits a quick-filled field", async () => {
    await quickFill("Residential Burst Pipe");

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("0000"), {
        target: { value: "2001" },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2000));
    });

    expect(
      calls.filter((c) => c.method === "POST" && c.url === "/api/inspections"),
    ).toHaveLength(1);
  });
});
