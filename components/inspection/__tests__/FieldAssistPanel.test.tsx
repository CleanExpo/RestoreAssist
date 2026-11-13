// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldAssistPanel } from "../FieldAssistPanel";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("RA-8001 [AC7] FieldAssistPanel refusal copy", () => {
  it("[AC7] a 402 envelope renders error.message in the alert", async () => {
    const message =
      "Add an Anthropic API key in Workspace Settings before using field assist.";
    respond(402, { error: { code: "PAYMENT_REQUIRED", message, eventId: "e1" } });

    render(<FieldAssistPanel inspectionId="insp_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Get guidance" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
  });

  it("[AC7] a non-envelope failure falls back to the generic copy", async () => {
    respond(500, {});

    render(<FieldAssistPanel inspectionId="insp_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Get guidance" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Assist unavailable");
  });
});
