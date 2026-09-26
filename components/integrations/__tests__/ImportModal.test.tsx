// @vitest-environment jsdom
/**
 * RA-7663 — the import modal must report what the server says arrived, not
 * what the user ticked. Before the fix it showed "Successfully imported 0
 * clients and 1 jobs" whenever the request did not error, even when the
 * response said imported: 0.
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

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from "react-hot-toast";
import ImportModal from "../ImportModal";

type JsonBody = Record<string, unknown>;

function jsonResponse(body: JsonBody, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Drive the modal to "one ServiceM8 job ticked", with `importReply` as the POST answer. */
function mockFetch(importReply: Response) {
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/integrations") {
      return jsonResponse({
        integrations: [
          { provider: "SERVICEM8", name: "ServiceM8", status: "CONNECTED" },
        ],
      });
    }
    if (u.endsWith("/clients")) return jsonResponse({ clients: [] });
    if (u.endsWith("/jobs") && init?.method === "POST") return importReply;
    if (u.endsWith("/jobs")) {
      return jsonResponse({
        jobs: [
          {
            id: "ej_1",
            externalId: "sm8-job-1",
            title: "Synthetic burst pipe job",
          },
        ],
      });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
}

async function tickTheJobAndImport() {
  render(<ImportModal isOpen onClose={() => {}} />);
  fireEvent.click(await screen.findByText("ServiceM8"));
  fireEvent.click(await screen.findByText(/^Jobs \(/));
  fireEvent.click(await screen.findByText("Synthetic burst pipe job"));
  fireEvent.click(screen.getByText("Import Selected"));
}

function allToastText(): string {
  const calls = [
    ...vi.mocked(toast.success).mock.calls,
    ...vi.mocked(toast.error).mock.calls,
  ];
  return calls.map((c) => String(c[0])).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ImportModal reports what was actually imported (RA-7663)", () => {
  it("main's response shape (success: true, imported: 0, errors) is not shown as a success", async () => {
    mockFetch(
      jsonResponse({
        success: true,
        imported: 0,
        errors: [{ id: "sm8-job-1", error: "Import failed" }],
      }),
    );
    await tickTheJobAndImport();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(allToastText()).not.toMatch(/Successfully imported/);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(
      /1 could not be imported/,
    );
  });

  it("the fixed shape (422, success: false, failed: 1) shows the failure count", async () => {
    mockFetch(
      jsonResponse(
        {
          success: false,
          imported: 0,
          failed: 1,
          errors: [{ id: "sm8-job-1", error: "Import failed" }],
        },
        422,
      ),
    );
    await tickTheJobAndImport();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(allToastText()).not.toMatch(/Successfully imported/);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(
      /1 could not be imported/,
    );
  });

  it("a real import reports the server's count", async () => {
    mockFetch(
      jsonResponse({ success: true, imported: 1, failed: 0, errors: [] }),
    );
    await tickTheJobAndImport();

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe(
      "Successfully imported 0 clients and 1 jobs",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});
