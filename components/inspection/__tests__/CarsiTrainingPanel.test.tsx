// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarsiTrainingPanel } from "../CarsiTrainingPanel";

describe("CarsiTrainingPanel", () => {
  it("lists matched CARSI courses as new-tab links", () => {
    render(<CarsiTrainingPanel claimType="MOULD" />);
    const link = screen.getByRole("link", { name: /Applied Microbial Remediation/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/carsi\.com\.au\/courses\/introduction-to-applied-microbial-remediation\?/);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows only the catalogue link when no course matches", () => {
    render(<CarsiTrainingPanel claimType="ASBESTOS" />);
    expect(screen.getByText(/No CARSI course is matched/)).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
