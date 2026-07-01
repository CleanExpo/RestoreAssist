// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseCard } from "../DatabaseCard";

beforeEach(() => vi.restoreAllMocks());

describe("DatabaseCard", () => {
  it("renders the connect-your-database step with a connection-string input", () => {
    render(<DatabaseCard />);
    expect(screen.getByText(/connect your database/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connection string/i)).toBeInTheDocument();
  });

  it("shows the provisioning state on a 202", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 202, json: async () => ({ data: { status: "provisioning" } }) }),
    );
    render(<DatabaseCard />);
    fireEvent.change(screen.getByLabelText(/connection string/i), {
      target: { value: "postgres://u:p@h:5432/db" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/your own database/i),
    );
  });

  it("surfaces the server error on a rejected connection string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        json: async () => ({ error: "Only PostgreSQL connection strings are supported." }),
      }),
    );
    render(<DatabaseCard />);
    fireEvent.change(screen.getByLabelText(/connection string/i), {
      target: { value: "mysql://h/db" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/only postgresql/i),
    );
  });
});
