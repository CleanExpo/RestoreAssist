// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed form-template load must not read as "No form templates yet".

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import FormTemplatesPage from "../page";

describe("FormTemplatesPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not the empty-account state, when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<FormTemplatesPage />);

    expect(await screen.findByText("Server error 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText(/No form templates yet/)).toHaveLength(0);
    expect(screen.queryAllByText("Create your first template")).toHaveLength(0);
  });

  it("Retry reloads the templates", async () => {
    const fetchMock = vi.fn(() => fail());
    vi.stubGlobal("fetch", fetchMock);
    render(<FormTemplatesPage />);
    const retry = await screen.findByRole("button", { name: "Retry" });

    fetchMock.mockImplementation(() => ok({ templates: [] }));
    fireEvent.click(retry);

    expect(await screen.findByText(/No form templates yet/)).toBeInTheDocument();
    expect(screen.queryByText("Server error 500")).not.toBeInTheDocument();
  });
});
