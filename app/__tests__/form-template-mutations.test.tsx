// @vitest-environment jsdom
/**
 * RA-7957 — the two template screens must send what the new routes accept and
 * must show a failed delete instead of swallowing it.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormCategory, FormType } from "@prisma/client";

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("react-hot-toast", () => ({
  default: { error: h.toastError, success: h.toastSuccess },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import NewTemplate from "../dashboard/form-templates/new/page";
import TemplateList from "../dashboard/forms/templates/page";

const template = {
  id: "owned",
  name: "Donga room check",
  formType: "CUSTOM",
  category: "CUSTOM",
  isActive: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const response = (body: unknown, ok = true, status = ok ? 201 : 403) => ({
  ok,
  status,
  json: async () => body,
});

function fillNew() {
  fireEvent.change(screen.getByPlaceholderText("e.g. Water Damage Initial Assessment"), {
    target: { value: "Donga room check" },
  });
}

describe("RA-7957 new-template screen", () => {
  it("offers only schema enum values, defaulting category to CUSTOM", () => {
    render(<NewTemplate />);
    const [type, category] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(type.options.length).toBeGreaterThan(0);
    expect(
      [...type.options].every((o) => Object.values(FormType).includes(o.value as FormType)),
    ).toBe(true);
    expect(
      [...category.options].every((o) =>
        Object.values(FormCategory).includes(o.value as FormCategory),
      ),
    ).toBe(true);
    expect(category.value).toBe("CUSTOM");
  });

  it("sends a schema-valid create payload", async () => {
    h.fetch.mockResolvedValue(response({ template }));
    render(<NewTemplate />);
    fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Create Template" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard/form-templates"));
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe("/api/form-templates");
    const data = JSON.parse(init.body);
    expect(data).toMatchObject({
      name: "Donga room check",
      formType: "CUSTOM",
      category: "CUSTOM",
      status: "DRAFT",
      requiresSignatures: false,
    });
    expect(JSON.parse(data.formSchema)).toEqual({ sections: [], fields: [] });
  });

  it("shows the server's refusal message (for example a technician's 403)", async () => {
    h.fetch.mockResolvedValue(
      response({ error: { code: "FORBIDDEN", message: "Only an owner or manager can create templates" } }, false),
    );
    render(<NewTemplate />);
    fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Create Template" }));
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith("Only an owner or manager can create templates"),
    );
  });
});

describe("RA-7957 template list delete", () => {
  it.each(["structured", "network", "empty"])(
    "keeps the row and shows a %s delete failure",
    async (kind) => {
      h.fetch.mockResolvedValueOnce(response({ templates: [template] }, true, 200));
      if (kind === "network") h.fetch.mockRejectedValueOnce(new Error("Connection failed"));
      else if (kind === "empty")
        h.fetch.mockResolvedValueOnce({
          ok: false,
          status: 405,
          json: async () => {
            throw new Error("empty body");
          },
        });
      else
        h.fetch.mockResolvedValueOnce(
          response({ error: { code: "FORBIDDEN", message: "Only an owner or manager can remove templates" } }, false),
        );
      render(<TemplateList />);
      fireEvent.click(await screen.findByRole("button", { name: "Delete Donga room check" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        kind === "structured"
          ? "Only an owner or manager can remove templates"
          : kind === "network"
            ? "Connection failed"
            : "Could not remove template",
      );
      expect(screen.getByText("Donga room check")).toBeInTheDocument();
      expect(h.fetch).toHaveBeenLastCalledWith("/api/form-templates/owned", { method: "DELETE" });
    },
  );

  it("removes the row only after the delete succeeds", async () => {
    h.fetch
      .mockResolvedValueOnce(response({ templates: [template] }, true, 200))
      .mockResolvedValueOnce(response({ success: true, archived: true }, true, 200));
    render(<TemplateList />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Donga room check" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByText("Donga room check")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
