import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const mutationControl = process.env.VERIFY_NAVIGATION_MUTATION === "1";
const bundle = await build({
  entryPoints: [path.join(here, "initial-entry-navigation-browser.tsx")],
  absWorkingDir: root,
  tsconfig: path.join(root, "tsconfig.json"),
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  plugins: mutationControl ? [{
    name: "remove-next-prevent-default-control",
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /FormNavigation\.tsx$/ }, (args) => ({
        contents: readFileSync(args.path, "utf8").replace("event.preventDefault();", ""),
        loader: "tsx",
        resolveDir: path.dirname(args.path),
      }));
    },
  }] : [],
});

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Save & Continue/ }).waitFor();
  assert.equal(await page.evaluate(() => window.__submitCount), 0,
    "Next changed to submit during the click and saved without consent");
  await page.getByRole("button", { name: /Save & Continue/ }).click();
  assert.equal(await page.evaluate(() => window.__submitCount), 1,
    "an explicit Save & Continue click must still submit exactly once");
  console.log("Chromium navigation boundary passed: Next=0 submits, Save=1 submit");
} finally {
  await browser.close();
}
