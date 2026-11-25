// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const blocked = vi.hoisted(() => ({ value: true }));
vi.mock("@/app/api/test/_helpers", () => ({ testHelpersBlocked: () => blocked.value }));

import Page, { metadata } from "@/app/dev/report-experience/canary/page";
import { REPORT_THEMES } from "@/lib/report-experience/catalog";
import { findAxeViolations, findMoneyLeaks, findUncitedStandards, hasSentinelPrice } from "@/lib/report-experience/canary/checks";
import { CANARY_AUDIENCES, CANARY_EVIDENCE, CANARY_SEES_MONEY, CANARY_SENTINEL_CENTS, canarySnapshot } from "@/lib/report-experience/canary/scenario";
import { ReportDesignStudio } from "@/components/report-experience/ReportDesignStudio";

afterEach(() => cleanup());
beforeEach(() => { blocked.value = true; });

function pageContent(container: HTMLElement) {
  return { markup: container.innerHTML, text: container.textContent ?? "" };
}

describe("canary page gate", () => {
  it("is a 404 while the test-helper switch is off (production default)", async () => {
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("is a 404 for an audience it does not know, even with the switch on", async () => {
    blocked.value = false;
    await expect(Page({ searchParams: Promise.resolve({ audience: "root" }) })).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("is a 404 under production settings, even if the test-helper switch is on (merging to main deploys production)", async () => {
    blocked.value = false;
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
      await expect(Page({ searchParams: Promise.resolve({ audience: "owner" }) })).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("renders with the switch on, and is never indexed", async () => {
    blocked.value = false;
    await expect(Page({ searchParams: Promise.resolve({ audience: "technician" }) })).resolves.toBeTruthy();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("the canary route is not advertised", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  it("neither the sitemap source nor robots.txt names a /dev route", () => {
    for (const file of ["app/sitemap.ts", "public/robots.txt"]) {
      expect(readFileSync(join(root, file), "utf8"), file).not.toMatch(/\/dev\b/);
    }
  });
});

describe("role isolation, through the real component, for every theme", () => {
  for (const audience of CANARY_AUDIENCES) {
    it(`${audience}: ${CANARY_SEES_MONEY[audience] ? "sees" : "never sees"} the price in all ten themes`, () => {
      const { container } = render(<ReportDesignStudio snapshot={canarySnapshot(audience)} />);
      for (const theme of REPORT_THEMES) {
        fireEvent.click(screen.getByRole("button", { name: new RegExp(theme.label, "i") }));
        const page = pageContent(container);
        if (CANARY_SEES_MONEY[audience]) {
          expect(hasSentinelPrice(page, CANARY_SENTINEL_CENTS), `${audience}/${theme.id} lost the price`).toBe(true);
        } else {
          expect(findMoneyLeaks(page, CANARY_SENTINEL_CENTS), `${audience}/${theme.id}`).toEqual([]);
        }
      }
    });
  }

  it("PLANTED: a technician fixture carrying the price is caught", () => {
    const planted = { ...canarySnapshot("technician"), financials: CANARY_EVIDENCE.financials };
    const { container } = render(<ReportDesignStudio snapshot={planted} />);
    expect(findMoneyLeaks(pageContent(container), CANARY_SENTINEL_CENTS).length).toBeGreaterThan(0);
  });
});

describe("citations on the rendered canary page", () => {
  it("every standard named is standardCite() output", async () => {
    blocked.value = false;
    const { container } = render(await Page({ searchParams: Promise.resolve({ audience: "owner" }) }));
    const text = container.textContent ?? "";
    expect(text).toContain("S500:2021");
    for (const theme of REPORT_THEMES) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(theme.label, "i") }));
      expect(findUncitedStandards(container.textContent ?? ""), theme.id).toEqual([]);
    }
  });

  it("PLANTED: a hand-typed citation added to the page is caught", async () => {
    blocked.value = false;
    const { container } = render(await Page({ searchParams: Promise.resolve({ audience: "owner" }) }));
    const p = document.createElement("p");
    p.textContent = "Drying follows IICRC S500:2015 §12"; // standards-cite-ignore: planted stale year
    container.appendChild(p);
    expect(findUncitedStandards(container.textContent ?? "").length).toBe(1);
  });
});

describe("axe on the rendered studio", () => {
  // jsdom has no layout, so contrast is checked in the browser run, not here.
  const run = (el: Element) => axe.run(el, { rules: { "color-contrast": { enabled: false } } });

  it("passes the studio, in every theme, for the fullest audience", async () => {
    const { container } = render(<ReportDesignStudio snapshot={canarySnapshot("owner")} />);
    for (const theme of REPORT_THEMES) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(theme.label, "i") }));
      expect(findAxeViolations(await run(container)), theme.id).toEqual([]);
    }
  });

  it("PLANTED: an image with no text alternative is caught", async () => {
    const { container } = render(<ReportDesignStudio snapshot={canarySnapshot("owner")} />);
    const img = document.createElement("img");
    img.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    container.appendChild(img);
    expect(findAxeViolations(await run(container)).some((f) => f.detail.startsWith("image-alt"))).toBe(true);
  });
});
