// @vitest-environment jsdom
/**
 * RA-8543 item 1 — both create screens send an Idempotency-Key: one key per
 * submit attempt, the same key again when that attempt is retried after a lost
 * reply, and a fresh key once the server has answered.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

const template = { id: "t1", name: "Donga room check", formType: "CUSTOM", category: "CUSTOM", isActive: true };
const ok = (body: unknown, status = 201) => ({ ok: true, status, json: async () => body });
const refused = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: { code: "X", message: `Refused ${status}` } }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function postKeys(): string[] {
  return h.fetch.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => (init.headers as Record<string, string>)["Idempotency-Key"]);
}

describe("RA-8543 new-template screen", () => {
  function name(value: string) {
    fireEvent.change(screen.getByPlaceholderText("e.g. Water Damage Initial Assessment"), {
      target: { value },
    });
  }
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create Template" }));

  it("sends an Idempotency-Key and reuses it when a lost reply is retried", async () => {
    h.fetch.mockRejectedValueOnce(new Error("Network lost")).mockResolvedValueOnce(ok({ template }));
    render(<NewTemplate />);
    name("Donga room check");
    submit();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Network lost"));
    submit();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard/form-templates"));
    const keys = postKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[\x21-\x7E]{8,255}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("uses a new key once the server has answered, and for a changed form", async () => {
    h.fetch
      .mockResolvedValueOnce(refused(400))
      .mockRejectedValueOnce(new Error("Network lost"))
      .mockRejectedValueOnce(new Error("Network lost"));
    render(<NewTemplate />);
    name("Donga room check");
    submit();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1));
    submit();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(2));
    name("Block C room check");
    submit();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(3));
    const keys = postKeys();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });
});

describe("RA-8543 inline create form on the template list", () => {
  async function openForm() {
    h.fetch.mockResolvedValueOnce(ok({ templates: [] }, 200));
    render(<TemplateList />);
    fireEvent.click((await screen.findAllByRole("button", { name: /new template/i }))[0]);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Site induction" } });
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "CUSTOM" } });
  }
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Save Template" }));

  it("sends an Idempotency-Key and reuses it when a lost reply is retried", async () => {
    await openForm();
    h.fetch.mockRejectedValueOnce(new Error("Network lost")).mockResolvedValueOnce(ok({ template }));
    submit();
    expect(await screen.findByText("Network lost")).toBeInTheDocument();
    submit();
    await waitFor(() => expect(postKeys()).toHaveLength(2));
    const keys = postKeys();
    expect(keys[0]).toMatch(/^[\x21-\x7E]{8,255}$/);
    expect(keys[1]).toBe(keys[0]);
  });
});
