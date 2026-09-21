// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ContractorsHubPage from "../page";

const SECTION_LINKS = [
  { title: "Profile", href: "/dashboard/contractors/profile" },
  { title: "Certifications", href: "/dashboard/contractors/certifications" },
  { title: "Equipment", href: "/dashboard/contractors/equipment" },
  { title: "Reviews", href: "/dashboard/contractors/reviews" },
  { title: "Service areas", href: "/dashboard/contractors/service-areas" },
] as const;

describe("Contractors hub (RA-7452)", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    redirect.mockClear();
  });

  it("renders five section links for an authenticated session", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    const ui = await ContractorsHubPage();
    render(ui);

    expect(
      screen.getByRole("heading", { name: "Contractor workspace" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Coming later")).not.toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const section of SECTION_LINKS) {
      expect(
        screen.getByRole("link", { name: new RegExp(section.title) }),
      ).toHaveAttribute("href", section.href);
    }
  });

  it("redirects unauthenticated visitors to login with a callback", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(ContractorsHubPage()).rejects.toThrow(
      "REDIRECT:/login?callbackUrl=/dashboard/contractors",
    );
  });

  it("does not import lucide-react", () => {
    const src = readFileSync(join(__dirname, "../page.tsx"), "utf8");
    expect(src).not.toMatch(/from ["']lucide-react["']/);
  });

  it("leaves equipment Back and workspace links pointing at the hub", () => {
    const src = readFileSync(join(__dirname, "../equipment/page.tsx"), "utf8");
    const matches = src.match(/href=["']\/dashboard\/contractors["']/g) ?? [];
    expect(matches).toHaveLength(2);
  });
});
