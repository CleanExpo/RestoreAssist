// @vitest-environment jsdom
/**
 * RA-7711 (C) — "Log New Incident" / "Log First Incident" appeared to do
 * nothing (observed live 2026-09-23: no dialog, no request, no console error).
 *
 * The model (WHSIncident), the API (POST /api/whs) and the form all exist.
 * The form opened as an inline panel at the top of the page, so a click on
 * "Log First Incident" in the empty state at the foot of the page mounted it
 * out of view. The form now opens as a dialog, visible from anywhere.
 *
 * This control fails if either button fails to open a visible create form,
 * if saving does not POST /api/whs, or if the new row is not listed under
 * Open.
 */
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "u1" } } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import WHSPage from "../page";

type Call = { url: string; method: string; body?: string };
const calls: Call[] = [];
let incidents: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls.length = 0;
  incidents = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url === "/api/whs" && method === "POST") {
        const body = JSON.parse(String(init?.body));
        const row = {
          id: "whs-1",
          ...body,
          createdAt: "2026-09-23T00:00:00.000Z",
          updatedAt: "2026-09-23T00:00:00.000Z",
          correctiveActions: [],
        };
        incidents = [row];
        return jsonResponse({ incident: row }, 201);
      }
      if (url === "/api/whs") return jsonResponse({ incidents });
      if (url.startsWith("/api/inspections")) {
        return jsonResponse({ inspections: [] });
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openFrom(buttonName: RegExp) {
  render(<WHSPage />);
  const button = await screen.findByRole("button", { name: buttonName });
  await act(async () => {
    fireEvent.click(button);
  });
  return screen.findByRole("dialog", { name: "Log New WHS Incident" });
}

describe("WHS Log incident buttons (RA-7711)", () => {
  it("'Log First Incident' opens the create form as a dialog", async () => {
    const dialog = await openFrom(/Log First Incident/);
    expect(within(dialog).getByLabelText(/Incident Type/)).toBeVisible();
  });

  it("'Log New Incident' opens the create form as a dialog", async () => {
    const dialog = await openFrom(/Log New Incident/);
    expect(within(dialog).getByLabelText(/Severity/)).toBeVisible();
  });

  it("saving POSTs /api/whs and lists the new incident under Open", async () => {
    const dialog = await openFrom(/Log New Incident/);

    fireEvent.change(within(dialog).getByLabelText(/Incident Type/), {
      target: { value: "Slip and Fall" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Severity/), {
      target: { value: "HIGH" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Status/), {
      target: { value: "OPEN" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Incident Date/), {
      target: { value: "2026-09-23" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Log Incident" }));
    });

    await waitFor(() =>
      expect(
        calls.filter((c) => c.url === "/api/whs" && c.method === "POST"),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Log New WHS Incident" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Open/ }));
    expect(await screen.findByText("Slip and Fall")).toBeInTheDocument();
  });
});
