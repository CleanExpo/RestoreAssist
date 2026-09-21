// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PortalHelpIndexPage from "../help/page";
import PortalHelpArticlePage from "../help/[slug]/page";
import { CLIENT_HELP_ARTICLES } from "@/lib/portal/client-help";
import { CLIENT_PORTAL_VIDEOS } from "@/lib/portal/client-videos";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";

function hrefs(): string[] {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
}

describe("client portal help pages", () => {
  it("lists client topics and hosted explainer media", async () => {
    const jsx = await PortalHelpIndexPage();
    render(jsx);

    expect(
      screen.getByRole("heading", { name: /client portal help/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not cover contractor tools/i)).toBeInTheDocument();
    for (const article of CLIENT_HELP_ARTICLES) {
      expect(screen.getByText(article.title)).toBeInTheDocument();
    }
    expect(screen.getByTestId("portal-help-media")).toBeInTheDocument();
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe(CLIENT_PORTAL_VIDEOS[0].url);
    expect(hrefs().some((href) => href.startsWith("/dashboard"))).toBe(false);
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        PORTAL_PATHS.login,
        PORTAL_PATHS.recovery,
        `${PORTAL_PATHS.help}/reports`,
      ]),
    );
  });

  it("renders a reports article without contractor chrome", async () => {
    const jsx = await PortalHelpArticlePage({
      params: Promise.resolve({ slug: "reports" }),
    });
    render(jsx);

    expect(
      screen.getByRole("heading", { name: /reading restoration reports/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/How To/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Share with client/)).not.toBeInTheDocument();
    expect(hrefs()).toEqual(expect.arrayContaining([PORTAL_PATHS.help]));
    expect(hrefs().some((href) => href === "/login")).toBe(false);
  });
});

describe("legacy reset-password bookmarks", () => {
  it("redirect to /portal/recovery instead of the closed 503 form", () => {
    const source = readFileSync(
      join(process.cwd(), "app/portal/reset-password/page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/redirect\(PORTAL_PATHS\.recovery\)/);
    expect(source).not.toMatch(/storeClientToken/);
    expect(source).not.toMatch(/\/api\/portal\/auth\/reset-password/);
  });
});
