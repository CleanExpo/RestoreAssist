// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import OwnerOnlyBillingNotice from "../OwnerOnlyBillingNotice";

afterEach(cleanup);

describe("OwnerOnlyBillingNotice (WP-06)", () => {
  it("tells staff to ask their business owner", () => {
    render(<OwnerOnlyBillingNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /ask your business owner/i,
    );
  });

  it("offers no way to pay or manage billing", () => {
    render(<OwnerOnlyBillingNotice />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/dashboard"]);
  });

  it("lets staff get back to their work", () => {
    render(<OwnerOnlyBillingNotice />);
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
