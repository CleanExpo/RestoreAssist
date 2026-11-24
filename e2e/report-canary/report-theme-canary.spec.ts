/**
 * RA-8110: report theme canary. Renders the report in EVERY theme in REPORT_THEMES
 * (read from the registry, so a theme added later is covered with no edit here) on the
 * synthetic scenario only, and checks, per theme:
 *   - phone, tablet and desktop width (390, 768, 1440): no sideways scroll, safety note visible,
 *     axe (serious and critical fail), and a screenshot kept as evidence;
 *   - reduced motion: no animation runs when the viewer asked for none;
 *   - print and PDF: light page, dark ink, controls hidden, a real PDF is produced;
 *   - role isolation: a technician's page, markup and sent data carry no price;
 *   - standards: every standard named is what standardCite() prints.
 * The last block plants each fault in the live page and requires the same check to fire,
 * so a green run is a run of checks that have been seen to fail.
 *
 * Needs the dev server with ALLOW_TEST_HELPERS=true (config/playwright.report-canary.config.ts
 * sets it). No login, no database, no real customer data. Never run against production.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { REPORT_THEMES } from "../../lib/report-experience/catalog";
import { standardCite } from "../../lib/nir-standards-mapping";
import {
  findAxeViolations,
  findMoneyLeaks,
  findOverflow,
  findPrintProblems,
  findUncitedStandards,
  hasSentinelPrice,
  type Finding,
} from "../../lib/report-experience/canary/checks";
import { CANARY_AUDIENCES, CANARY_SEES_MONEY, CANARY_SENTINEL_CENTS } from "../../lib/report-experience/canary/scenario";

const ROUTE = "/dev/report-experience/canary";
const WIDTHS = [390, 768, 1440] as const;
const MODES = [
  { name: "synthetic", query: "" },
  { name: "owner-snapshot", query: "?audience=owner" },
] as const;

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function open(page: Page, query = "") {
  await page.goto(ROUTE + query, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("report-design-studio")).toBeVisible();
}

async function selectTheme(page: Page, id: string, label: string) {
  const button = page.getByRole("button", { name: new RegExp(escape(label)) }).first();
  // The first clicks can land before React has hydrated; retry until the page agrees.
  await expect(async () => {
    await button.click();
    await expect(page.locator("#visual-report-content")).toHaveAttribute("data-theme", id, { timeout: 1500 });
  }).toPass({ timeout: 45_000 });
  // Colours ease between themes over 200ms; every reader (axe contrast, print colours) must see the settled page.
  await settled(page);
}

async function axeFindings(page: Page): Promise<Finding[]> {
  const present = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== "undefined");
  if (!present) await page.addScriptTag({ content: AXE_SOURCE });
  const results = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<unknown> } }).axe;
    return axe.run({ include: [["main"], ["[data-testid='canary-standards']"]], exclude: [["nextjs-portal"], ["next-route-announcer"]] }, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
  });
  return findAxeViolations(results as Parameters<typeof findAxeViolations>[0]);
}

async function pageContent(page: Page) {
  return page.evaluate(() => ({ markup: document.documentElement.outerHTML, text: document.body.innerText }));
}

async function overflowFindings(page: Page) {
  return findOverflow(await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  })));
}

// Colour changes ease in over 200ms (global rule), so a colour read right after a theme or media change
// can be mid-transition. Wait until no colour transition is still running. Only transitions: the page may
// carry a looping animation that never finishes, and waiting on that would hang every theme change.
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().filter((a) => a instanceof CSSTransition).every((a) => a.playState !== "running"));

// Under reduced motion the global rule shortens every animation to 0.01ms. Only motion a viewer could see
// (longer than 50ms) counts as running.

const report = (page: Page) => page.locator("#visual-report-content");
const label = (theme: { id: string }, f: Finding) => `${theme.id}: [${f.check}] ${f.detail}`;

// The first click can land before React has hydrated; retry until the page agrees it is animating.
// One owner for this wait: both the reduced-motion sweep and the planted-fault control call it.
async function previewMotion(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "Preview motion" }).click();
    await expect(report(page)).toHaveAttribute("data-animated", "true", { timeout: 1500 });
  }).toPass({ timeout: 45_000 });
}

test("the registry's themes are exactly the themes the page offers", async ({ page }) => {
  expect(REPORT_THEMES.length).toBeGreaterThanOrEqual(10);
  await open(page);
  for (const theme of REPORT_THEMES) {
    await expect(page.getByRole("button", { name: new RegExp(escape(theme.label)) }).first()).toBeVisible();
  }
});

for (const width of WIDTHS) {
  for (const mode of MODES) {
    test(`every theme at ${width}px, ${mode.name}: fits, shows the safety note, passes axe`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, mode.query);
      const problems: string[] = [];
      for (const theme of REPORT_THEMES) {
        await selectTheme(page, theme.id, theme.label);
        const found: Finding[] = [...(await overflowFindings(page)), ...(await axeFindings(page))];
        const note = report(page).getByRole("note").first();
        if (!(await note.isVisible())) found.push({ check: "safety", detail: "safety note is not visible" });
        problems.push(...found.map((f) => label(theme, f)));
        const shot = testInfo.outputPath(`${mode.name}-${theme.id}-${width}.png`);
        await report(page).screenshot({ path: shot });
        await testInfo.attach(`${mode.name}-${theme.id}-${width}`, { path: shot, contentType: "image/png" });
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}

test("reduced motion: no animation runs in any theme, and the probe can see one when motion is allowed", async ({ browser }) => {
  const running = (page: Page) => report(page).evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().duration ?? 0) > 50).length);
  const sweep = async (reducedMotion: "reduce" | "no-preference") => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await context.newPage();
    await open(page);
    const counts: Record<string, number> = {};
    for (const theme of REPORT_THEMES) {
      await selectTheme(page, theme.id, theme.label);
      await previewMotion(page);
      counts[theme.id] = await running(page);
    }
    await context.close();
    return counts;
  };
  const withMotion = await sweep("no-preference");
  // Positive control: motion really plays for a viewer who allows it, so a zero below means something.
  expect(Object.values(withMotion).some((n) => n > 0), JSON.stringify(withMotion)).toBe(true);
  const reduced = await sweep("reduce");
  const offenders = Object.entries(reduced).filter(([, n]) => n > 0).map(([id, n]) => `${id}: ${n} running`);
  expect(offenders, offenders.join("\n")).toEqual([]);
});

for (const mode of MODES) {
  test(`print and PDF, ${mode.name}: light page, dark ink, no controls, a real PDF, every theme`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, mode.query);
    const problems: string[] = [];
    for (const theme of REPORT_THEMES) {
      await page.emulateMedia({ media: "screen" });
      await selectTheme(page, theme.id, theme.label);
      await page.emulateMedia({ media: "print" });
      await settled(page);
      const colours = await report(page).evaluate((el) => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, ink: s.color };
      });
      problems.push(...findPrintProblems(colours).map((f) => label(theme, f)));
      const hidden = await page.getByLabel("Report preview controls").isHidden();
      if (!hidden) problems.push(`${theme.id}: [print] preview controls are still on the printed page`);
      if (!(await report(page).getByRole("note").first().isVisible())) problems.push(`${theme.id}: [print] safety note is not on the printed page`);
      const pdf = await page.pdf({ printBackground: true, format: "A4" });
      const head = pdf.subarray(0, 5).toString("latin1");
      const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      if (head !== "%PDF-" || pdf.length < 8_000 || pages < 1) problems.push(`${theme.id}: [print] PDF is not a real document (${head}, ${pdf.length} bytes, ${pages} pages)`);
      if (theme.id === "dark-tech") await testInfo.attach(`${mode.name}-dark-tech.pdf`, { body: pdf, contentType: "application/pdf" });
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("role isolation: a technician's page, markup and sent data carry no price, in every theme", async ({ page, request }) => {
  const problems: string[] = [];
  for (const audience of CANARY_AUDIENCES) {
    const query = `?audience=${audience}`;
    // The raw response is what the server sent, including data handed to the client component.
    const raw = await (await request.get(ROUTE + query)).text();
    const sees = CANARY_SEES_MONEY[audience];
    if (!sees) problems.push(...findMoneyLeaks({ markup: raw, text: raw.replace(/<[^>]+>/g, " ") }, CANARY_SENTINEL_CENTS).filter((f) => f.detail.includes("sentinel")).map((f) => `${audience} raw response: ${f.detail}`));
    else if (!hasSentinelPrice({ markup: raw, text: "" }, CANARY_SENTINEL_CENTS)) problems.push(`${audience}: probe blind, the price is not in the raw response`);
    await open(page, query);
    for (const theme of REPORT_THEMES) {
      await selectTheme(page, theme.id, theme.label);
      const content = await pageContent(page);
      if (sees) {
        if (!hasSentinelPrice(content, CANARY_SENTINEL_CENTS)) problems.push(`${audience}/${theme.id}: price missing for a viewer who may see it`);
      } else {
        problems.push(...findMoneyLeaks(content, CANARY_SENTINEL_CENTS).map((f) => `${audience}/${theme.id}: ${f.detail}`));
      }
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

for (const mode of MODES) {
  test(`standards, ${mode.name}: every standard named is standardCite() output, in every theme`, async ({ page }) => {
    await open(page, mode.query);
    const problems: string[] = [];
    for (const theme of REPORT_THEMES) {
      await selectTheme(page, theme.id, theme.label);
      const { text } = await pageContent(page);
      problems.push(...findUncitedStandards(text).map((f) => label(theme, f)));
      if (!text.includes(standardCite("S500"))) problems.push(`${theme.id}: the page does not show ${standardCite("S500")}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test.describe("the canary can fail: each fault planted in the live page is caught", () => {
  test("a price on a technician page", async ({ page }) => {
    await open(page, "?audience=technician");
    expect(findMoneyLeaks(await pageContent(page), CANARY_SENTINEL_CENTS)).toEqual([]);
    await page.evaluate(() => { document.body.insertAdjacentHTML("beforeend", "<p>Estimate $76,543.21</p>"); });
    expect(findMoneyLeaks(await pageContent(page), CANARY_SENTINEL_CENTS).length).toBeGreaterThan(0);
  });

  test("an unlabelled image", async ({ page }) => {
    await open(page);
    expect(await axeFindings(page)).toEqual([]);
    // Plant it inside <main>: axe only scans main and the standards panel, so an image on <body> is outside its reach.
    await page.evaluate(() => { document.querySelector("main")!.insertAdjacentHTML("beforeend", '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'); });
    expect((await axeFindings(page)).some((f) => f.detail.startsWith("image-alt"))).toBe(true);
  });

  test("text that overflows a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page);
    expect(await overflowFindings(page)).toEqual([]);
    await page.evaluate(() => { document.body.insertAdjacentHTML("beforeend", '<div style="width:1400px;height:4px">x</div>'); });
    expect((await overflowFindings(page)).length).toBe(1);
  });

  test("a hand-typed citation", async ({ page }) => {
    await open(page);
    expect(findUncitedStandards((await pageContent(page)).text)).toEqual([]);
    await page.evaluate(() => { document.body.insertAdjacentHTML("beforeend", "<p>Drying follows IICRC S500:2015 §12</p>"); /* standards-cite-ignore: planted stale year */ });
    expect(findUncitedStandards((await pageContent(page)).text).length).toBe(1);
  });

  test("a theme with no reduced-motion branch", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await open(page);
    await previewMotion(page);
    await expect(report(page).locator("[class*='ganttMotion']").first()).toBeAttached(); // the probe has a subject
    const running = () => report(page).evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().duration ?? 0) > 50).length);
    expect(await running()).toBe(0);
    // Undo the stylesheet's reduce branch for the bar the Gantt animates.
    await page.addStyleTag({ content: "@media (prefers-reduced-motion: reduce) { [data-animated='true'] [class*='ganttMotion'] { animation: reveal 5s linear both !important; animation-duration: 5s !important; } @keyframes reveal { from { opacity: 0 } to { opacity: 1 } } }" });
    await expect.poll(running).toBeGreaterThan(0);
    await context.close();
  });

  test("a dark theme leaking into print", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await selectTheme(page, "dark-tech", "Dark Tech");
    await page.emulateMedia({ media: "print" });
    await settled(page);
    const read = () => report(page).evaluate((el) => { const s = getComputedStyle(el); return { background: s.backgroundColor, ink: s.color }; });
    expect(findPrintProblems(await read())).toEqual([]);
    await page.addStyleTag({ content: "@media print { #visual-report-content { background: rgb(10, 25, 47) !important; color: rgb(255, 255, 255) !important; } }" });
    await settled(page); // colours ease in over 200ms; read only once they have landed
    expect(findPrintProblems(await read()).length).toBeGreaterThan(0);
  });
});
