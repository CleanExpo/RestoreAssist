// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React, { createContext, useContext } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Radix Select does not open in jsdom; a plain stand-in keeps the test on the
// panel's own failure handling (RA-8085).
vi.mock("@/components/ui/select", () => {
  const Ctx = createContext<(v: string) => void>(() => {});
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (v: string) => void;
      children: React.ReactNode;
    }) => <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const set = useContext(Ctx);
      return (
        <button type="button" onClick={() => set(value)}>
          {children}
        </button>
      );
    },
  };
});

import ApprovalPanel from "../ApprovalPanel";

const EMPTY = "No approvals requested yet.";

const pending = {
  id: "a1",
  reportId: "r1",
  approvalType: "SCOPE_OF_WORK",
  status: "PENDING",
  requestedAt: "2026-10-01T00:00:00.000Z",
  respondedAt: null,
  clientComments: null,
  amount: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

function res(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

const thrown = () => Promise.reject(new TypeError("Failed to fetch"));

beforeEach(() => vi.restoreAllMocks());

describe("ApprovalPanel failures (RA-8085)", () => {
  it.each([
    ["a non-ok response", () => Promise.resolve(res({}, false))],
    ["a thrown fetch", thrown],
  ])(
    "shows an error and Retry when the load fails with %s",
    async (_, fail) => {
      const f = vi
        .fn()
        .mockImplementationOnce(fail)
        .mockResolvedValueOnce(res({ approvals: [pending] }));
      vi.stubGlobal("fetch", f);
      render(<ApprovalPanel reportId="r1" />);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Couldn't load approvals.");
      expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("Scope of Work")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it.each([
    [
      "a 404 with the API message",
      () =>
        Promise.resolve(
          res(
            { error: { code: "NOT_FOUND", message: "Approval not found" } },
            false,
            404,
          ),
        ),
      "Approval not found",
    ],
    ["a thrown fetch", thrown, "Couldn't record the response. Try again."],
  ])(
    "shows an error next to the approval when Approve fails with %s",
    async (_, fail, msg) => {
      const f = vi
        .fn()
        .mockResolvedValueOnce(res({ approvals: [pending] }))
        .mockImplementationOnce(fail);
      vi.stubGlobal("fetch", f);
      render(<ApprovalPanel reportId="r1" />);

      fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(msg);
      // Still pending: nothing was recorded.
      expect(screen.getByText("Awaiting Response")).toBeInTheDocument();
    },
  );

  it.each([
    [
      "a 400 with the API message",
      () =>
        Promise.resolve(
          res(
            {
              error: {
                code: "VALIDATION",
                message: "Amount must be a non-negative finite number",
              },
            },
            false,
            400,
          ),
        ),
      "Amount must be a non-negative finite number",
    ],
    ["a thrown fetch", thrown, "Couldn't request approval. Try again."],
  ])(
    "keeps the dialog open and shows the error when Request Approval fails with %s",
    async (_, fail, msg) => {
      const f = vi
        .fn()
        .mockResolvedValueOnce(res({ approvals: [] }))
        .mockImplementationOnce(fail);
      vi.stubGlobal("fetch", f);
      render(<ApprovalPanel reportId="r1" />);

      await screen.findByText(EMPTY);
      fireEvent.click(screen.getByRole("button", { name: /Request Approval/ }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Scope of Work" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(msg);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    },
  );
});
