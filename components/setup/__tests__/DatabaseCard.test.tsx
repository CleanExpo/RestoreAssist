// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseCard } from "../DatabaseCard";

beforeEach(() => vi.restoreAllMocks());

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(/connection string/i), {
    target: { value },
  });

describe("DatabaseCard — guided flow", () => {
  it("offers DB-type options and shows the matching setup tutorial", () => {
    render(<DatabaseCard />);
    expect(screen.getByText(/connect your database/i)).toBeInTheDocument();
    // Supabase is the default; its official tutorial link is shown.
    const link = screen.getByRole("link", { name: /connect/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("supabase.com/docs"),
    );
  });

  it("switches tutorials when the DB type changes", () => {
    render(<DatabaseCard />);
    fireEvent.click(screen.getByRole("button", { name: /neon/i }));
    expect(
      screen.getByRole("link", { name: /connect/i }),
    ).toHaveAttribute("href", expect.stringContaining("neon.tech"));
  });

  it("gives inline validation feedback on a bad connection string", () => {
    render(<DatabaseCard />);
    type("mysql://h/db");
    expect(screen.getByText(/only postgresql/i)).toBeInTheDocument();
  });

  it("requires a confirm step showing the host before it POSTs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DatabaseCard />);
    type("postgres://u:p@db.abcdef.supabase.co:5432/postgres");
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    // Confirmation shows the host and fetch has NOT fired yet.
    expect(await screen.findByText(/db\.abcdef\.supabase\.co/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs on confirm and shows the provisioning state with the host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 202, json: async () => ({ data: { status: "provisioning" } }) }),
    );
    render(<DatabaseCard />);
    type("postgres://u:p@db.abcdef.supabase.co:5432/postgres");
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/your own database/i);
    expect(status).toHaveTextContent(/db\.abcdef\.supabase\.co/);
  });

  it("surfaces the server error with a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 400, json: async () => ({ error: "Only PostgreSQL connection strings are supported." }) }),
    );
    render(<DatabaseCard />);
    type("postgres://u:p@db.abcdef.supabase.co:5432/postgres");
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/only postgresql/i);
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });
});
