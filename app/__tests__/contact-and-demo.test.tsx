// @vitest-environment jsdom
/**
 * RA-8403 — /contact showed a personal Gmail address, and /demo returned 404
 * with no "book a demo" path anywhere on the site.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import ContactPage from "../contact/page";
import DemoPage from "../demo/page";
import { BRAND } from "@/lib/brand";

// framer-motion's whileInView needs an IntersectionObserver; jsdom has none.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("contact page (RA-8403)", () => {
  it("shows the business support address as a mail link, never a personal one", () => {
    window.history.replaceState(null, "", "/contact");
    const { container } = render(<ContactPage />);
    expect(container.textContent ?? "").not.toMatch(/@gmail\.com/i);
    const link = screen.getByRole("link", { name: BRAND.company.supportEmail });
    expect(link).toHaveAttribute("href", `mailto:${BRAND.company.supportEmail}`);
    expect(
      screen.getByRole("heading", { level: 1, name: /contact us/i }),
    ).toBeInTheDocument();
  });

  it("becomes the demo request form when reached from /demo", async () => {
    window.history.replaceState(null, "", "/contact?topic=demo");
    render(<ContactPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: /book a demo/i }),
    ).toBeInTheDocument();
  });
});

describe("/demo (RA-8403)", () => {
  it("sends the visitor to the contact form in demo mode", () => {
    DemoPage();
    expect(redirect).toHaveBeenCalledWith("/contact?topic=demo");
  });
});
