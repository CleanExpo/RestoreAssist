/**
 * RA-8106 development-only visual smoke.
 * Start a local Next.js development server and run:
 *   REPORT_STUDIO_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node scripts/report-experience-visual-smoke.mjs
 *
 * No production or real client data accessed. Screenshots are local only.
 */
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const url = process.env.REPORT_STUDIO_URL || "http://localhost:3119/dev/report-experience";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/dev\/report-experience$/.test(url)) {
  throw new Error("Only an explicitly local synthetic design studio is allowed.");
}
const screenshotDir = join(os.tmpdir(), "restoreassist-report-studio-smoke");
await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.REPORT_STUDIO_BROWSER ? { executablePath: process.env.REPORT_STUDIO_BROWSER } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const names = [
  ["Executive Modern", "executive-modern"],
  ["Dark Tech", "dark-tech"],
  ["Minimal Clean", "minimal-clean"],
  ["Visual Storytelling", "visual-storytelling"],
  ["Technical Dashboard", "technical-dashboard"],
  ["Interactive 3D & Models", "interactive-3d-models"],
  ["Safety & Compliance", "safety-compliance"],
  ["Before / During / After", "before-during-after"],
  ["Map & Location", "map-location"],
  ["Branded Custom Theme", "branded-custom"],
];
try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  if (response?.status() !== 200) throw new Error("Studio returned HTTP " + response?.status());
  await page.waitForFunction(() => Object.keys(document.querySelector("button[data-active]") || {}).some(key => key.startsWith("__reactProps$")), null, { timeout: 20_000 });
  for (const [label, id] of names) {
    await page.getByRole("button", { name: label, exact: false }).click();
    await page.waitForFunction(target => document.querySelector("article[data-theme]")?.getAttribute("data-theme") === target, id);
    const safety = await page.getByRole("note", { name: /Safety warning/i }).textContent();
    if (!safety?.includes("Possible electrical exposure")) throw new Error("Safety warning missing in theme " + id);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error("Desktop overflow for " + id);
    await page.screenshot({ path: join(screenshotDir, id + ".png"), fullPage: true });
  }
  await page.getByRole("button", { name: /Interactive web/i }).click();
  await page.getByRole("button", { name: /Preview motion/i }).click();
  const animated = await page.locator("article[data-animated]").getAttribute("data-animated");
  if (animated !== "true") throw new Error("Manual motion control failed");
  await page.getByRole("button", { name: /Print \/ PDF/i }).click();
  if (await page.locator("article[data-animated]").getAttribute("data-animated") !== "false") throw new Error("PDF mode still animated");
  await page.screenshot({ path: join(screenshotDir, "pdf-mode.png"), fullPage: true });
  const pdfPath = join(screenshotDir, "static-report-sample.pdf");
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: false });
  // The existing global print stylesheet hides content outside #visual-report-content.
  // A 200 response and a two-page PDF are NOT evidence that the PDF contains text.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readFile(pdfPath)), useSystemFonts: true }).promise;
  let pdfText = "";
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const textLayer = await (await pdf.getPage(number)).getTextContent();
    pdfText += textLayer.items.map(item => "str" in item ? item.str : "").join(" ") + " ";
  }
  const compactPdfText = pdfText.replace(/\s+/g, "").toLowerCase();
  for (const required of ["report0001", "Safety comes before presentation", "Possible electrical exposure",
    "Limits and missing evidence", "Required evidence and sign-off"]) {
    if (!compactPdfText.includes(required.replace(/\s+/g, "").toLowerCase())) {
      throw new Error("Printed PDF is blank or missing required evidence: " + required);
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: /Interactive web/i }).click();
  for (const [label, id] of names) {
    await page.getByRole("button", { name: label, exact: false }).click();
    await page.waitForFunction(target => document.querySelector("article[data-theme]")?.getAttribute("data-theme") === target, id);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error("Mobile overflow for " + id);
  }
  await page.screenshot({ path: join(screenshotDir, "mobile.png"), fullPage: true });
  if (errors.length) throw new Error("Client runtime errors: " + JSON.stringify(errors));
  console.log(JSON.stringify({ result: "PASS", themes: names.length, desktopViewport: "1280x900", mobileViewport: "375x812",
    evidence: screenshotDir, printedPDF: "static-report-sample.pdf", errors: 0 }, null, 2));
} finally {
  await browser.close();
}
