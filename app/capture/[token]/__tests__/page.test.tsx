// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok123" }),
}));

// Stub the heavy editor; capture the props it was rendered with.
const editorProps: Record<string, unknown> = {};
vi.mock("@/components/sketch/SketchEditorV2", () => ({
  SketchEditorV2: (props: Record<string, unknown>) => {
    Object.assign(editorProps, props);
    return <div data-testid="editor" />;
  },
}));

import HomeownerCapturePage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(editorProps)) delete editorProps[k];
});

describe("Homeowner /capture/[token] page", () => {
  it("renders the guided editor with the capture token on a valid token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ propertyAddress: "12 Test St, Brisbane" }),
      }),
    );
    render(<HomeownerCapturePage />);
    await waitFor(() =>
      expect(screen.getByTestId("editor")).toBeInTheDocument(),
    );
    expect(screen.getByText(/12 Test St/)).toBeInTheDocument();
    expect(editorProps.mode).toBe("guided");
    expect(editorProps.captureToken).toBe("tok123");
  });

  it("shows a dead-end (never the editor) on an invalid/expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );
    render(<HomeownerCapturePage />);
    await waitFor(() =>
      expect(screen.getByText(/isn.t valid/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
  });
});
