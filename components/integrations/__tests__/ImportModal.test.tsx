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
          { id: "servicem8_synthetic", provider: "SERVICEM8", name: "ServiceM8", status: "CONNECTED", hasOAuthCredentials: true },
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

const genuineXero = { id: "synthetic_xero", provider: "XERO", name: "Xero", status: "CONNECTED", tenantId: "synthetic-org", hasOAuthCredentials: true };
function metadata(body: JsonBody, status = 200) {
  global.fetch = vi.fn(async () => jsonResponse(body, status)) as typeof fetch;
}
describe("ImportModal provider boundaries", () => {
  it("excludes both legacy AI providers even when their stored enum is XERO", async () => {
    metadata({integrations: [
      {id: "ai_1", name: "Anthropic Claude", provider: "XERO", status: "CONNECTED", icon: "[ra:ai]"},
      {id: "ai_2", name: "OpenAI GPT", provider: "XERO", status: "CONNECTED", icon: "[ra:ai]"},
    ]});
    render(<ImportModal isOpen onClose={() => {}} />);
    await screen.findByText("No integrations ready to import");
    expect(screen.queryByRole("button", {name: "Xero"})).toBeNull();
  });
  it("excludes a Xero record without an organisation and a legacy Ascora record", async () => {
    metadata({integrations: [{...genuineXero, tenantId: null}, {id: "ascora", name: "Ascora", provider: "ASCORA", status: "CONNECTED"}]});
    render(<ImportModal isOpen onClose={() => {}} />);
    await screen.findByText("No integrations ready to import");
    expect(screen.queryByRole("button", {name: "Xero"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Ascora"})).toBeNull();
  });
  it("allows a genuine custom-named Xero connection", async () => {
    metadata({integrations: [{...genuineXero, name: "Our accounts"}]});
    render(<ImportModal isOpen onClose={() => {}} />);
    expect(await screen.findByRole("button", {name: "Xero"})).toBeEnabled();
  });
  it.each([
    [{integrations: [genuineXero], truncated: true}, 200],
    [{integrations: [genuineXero]}, 503],
    [{}, 200],
  ])("treats incomplete or failed metadata as unavailable", async (body, status) => {
    metadata(body, status);
    render(<ImportModal isOpen onClose={() => {}} />);
    expect(await screen.findByText("Integration status is unavailable. Retry before importing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Xero"})).toBeNull();
  });
  it("clears previously loaded choices when a later metadata request fails", async () => {
    metadata({integrations: [genuineXero]});
    const view = render(<ImportModal isOpen onClose={() => {}} />);
    await screen.findByRole("button", {name: "Xero"});
    view.rerender(<ImportModal isOpen={false} onClose={() => {}} />);
    metadata({}, 503);
    view.rerender(<ImportModal isOpen onClose={() => {}} />);
    await screen.findByText("Integration status is unavailable. Retry before importing.");
    expect(screen.queryByRole("button", {name: "Xero"})).toBeNull();
  });
  it("shows unavailable data instead of claiming empty records after a failed provider read", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/integrations"
      ? jsonResponse({integrations: [genuineXero]}) : jsonResponse({}, 503)) as typeof fetch;
    render(<ImportModal isOpen onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", {name: "Xero"}));
    await screen.findByText("Import data is unavailable. Retry before selecting items.");
    expect(screen.queryByText("No new clients to import. Try syncing first.")).toBeNull();
    expect(screen.getByRole("button", {name: "Import Selected"})).toBeDisabled();
  });
  it("refuses to choose between two genuine Xero connections", async () => {
    metadata({integrations: [genuineXero, {...genuineXero, id: "other"}]});
    render(<ImportModal isOpen onClose={() => {}} />);
    expect(await screen.findByText(/Multiple workspace connections/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Xero"})).toBeNull();
  });
});
