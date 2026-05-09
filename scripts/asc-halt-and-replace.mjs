// scripts/asc-halt-and-replace.mjs
//
// RA-2073 — finalise the 1.0.3 submission while preventing 1.0.2(12)
// from auto-releasing the broken sign-in loop today.
//
// State on entry:
//   • 1.0.2(12) is APPROVED ("Ready for Distribution")
//   • 1.0.2(12) is scheduled to auto-release at 2026-05-09 07:00 AWST
//   • 1.0.2(12) contains the broken token-handoff sign-in loop fix
//   • 1.0.3(14) has been uploaded to TestFlight (processing/processed)
//
// Two-phase plan:
//   Phase A — halt 1.0.2 release
//     1. Open 1.0.2 distribution page
//     2. Flip release setting from "Automatically" to "Manually"
//     3. Save
//
//   Phase B — submit 1.0.3 for review
//     4. Create new version 1.0.3
//     5. Attach build 1.0.3 (14) (waits if still processing)
//     6. Replace "What's New" with the loop-fix description
//     7. Replace App Review Information / notes
//     8. Save → Submit for Review
//
// Reuses /tmp/chrome-asc-profile so the Apple ID session from the
// previous resubmit run carries over (no re-MFA needed).

import { chromium } from "@playwright/test";
import * as fs from "fs";

const APP_ID = "6761808113";
const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-halt-and-replace-screenshots";

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";

const NEW_VERSION = "1.0.3";
const TARGET_BUILD_NUMBER = "14";

const WHATS_NEW = [
  "1.0.3 fixes the sign-in loop reported on 1.0.2.",
  "",
  "Sign-in flow rewritten to use the native iOS Apple sign-in sheet",
  "(ASAuthorizationController). Continue with Apple now stays inside",
  "the app — no more bouncing back to the login screen after",
  "authentication.",
  "",
  "Email/password sign-in remains available.",
].join("\n");

const REVIEW_NOTES = [
  "Build 1.0.3 (14) — RA-2073 sign-in loop fix.",
  "",
  "WHAT CHANGED FROM 1.0.2 (12):",
  "Sign-in flow rewritten to use native iOS ASAuthorizationController",
  "via the @capgo/capacitor-social-login plugin. Continue with Apple",
  "now opens the native iOS sheet (not Safari View Controller). The",
  "Apple identity JWT is exchanged for a session cookie via",
  "/api/auth/native-token-exchange, with Set-Cookie landing directly",
  "in WKWebView's cookie jar — fixing the sign-in loop reported on",
  "1.0.2 (12).",
  "",
  "GUIDELINE 4.8 (LOGIN SERVICES):",
  "Continue with Google is hidden on iOS in this build (UI gated by",
  "Capacitor.isNativePlatform check). Apple Sign-In is the only",
  "external login offered on iOS, so 4.8 does not apply.",
  "Email/password remains available.",
  "",
  "REVIEWER ACCOUNT:",
  `Email: ${REVIEWER_EMAIL}`,
  "Password: see Sign-In Information above.",
  "",
  "Or: tap Continue with Apple — works for any Apple ID; the account",
  "is auto-provisioned on first sign-in with a 30-day Trial.",
].join("\n");

fs.mkdirSync(SS, { recursive: true });

async function ss(page, name) {
  try {
    await page.screenshot({ path: `${SS}/${name}.png`, fullPage: true });
    console.log(`[asc] screenshot: ${name}`);
  } catch {}
}

async function dumpButtons(page, prefix) {
  const btns = await page.locator("button, a[role='button']").all();
  console.log(`[asc] [${prefix}] interactive elements (${btns.length}):`);
  for (const b of btns) {
    const t = ((await b.textContent().catch(() => "")) || "").trim();
    const a = (await b.getAttribute("aria-label").catch(() => "")) || "";
    if (t || a) console.log(`  > "${t}" | aria="${a}"`);
  }
}

async function waitForSignIn(page) {
  if (page.url().includes("login") || page.url().includes("FAILED")) {
    console.log(
      "[asc] not signed in — please complete Apple ID + 2FA in the open Chrome window (5 min timeout)",
    );
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);
      if (!page.url().includes("login") && !page.url().includes("FAILED")) {
        return;
      }
      process.stdout.write(".");
    }
    throw new Error("sign-in timeout");
  }
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--profile-directory=Default"],
  viewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();

// =============================================================================
// PHASE A — halt 1.0.2 auto-release
// =============================================================================
console.log("[asc] === PHASE A: halt 1.0.2 auto-release ===");
const URL_1_0_2 = `https://appstoreconnect.apple.com/apps/${APP_ID}/distribution/ios/version/deliverable`;
await page.goto(URL_1_0_2, { timeout: 60000, waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(4000);
await waitForSignIn(page);
await page.waitForTimeout(3000);
await ss(page, "A1-1.0.2-loaded");
console.log("[asc] URL:", page.url());

// Find the "Manually release this version" radio button and click it
async function clickManualRelease() {
  // Try multiple matchers — Apple's HTML uses a radio set
  const candidates = [
    page.getByLabel(/Manually release this version/i).first(),
    page.locator("input[type='radio']").filter({ hasText: /Manually/i }).first(),
    page.locator("label").filter({ hasText: /^Manually release this version$/i }).first(),
  ];
  for (const c of candidates) {
    if (await c.isVisible({ timeout: 2000 }).catch(() => false)) {
      await c.click({ force: true });
      await page.waitForTimeout(1500);
      console.log("[asc] clicked Manually release radio");
      return true;
    }
  }
  // Fallback: scan all labels
  const labels = await page.locator("label").all();
  for (const l of labels) {
    const t = ((await l.textContent().catch(() => "")) || "").trim();
    if (/^Manually release this version$/i.test(t)) {
      await l.click({ force: true });
      await page.waitForTimeout(1500);
      console.log("[asc] clicked Manually release label");
      return true;
    }
  }
  return false;
}

const flipped = await clickManualRelease();
if (!flipped) {
  console.log("[asc] couldn't find Manually-release radio — dumping inputs");
  const inps = await page.locator("input[type='radio']").all();
  for (const i of inps) {
    const id = (await i.getAttribute("id").catch(() => "")) || "";
    const name = (await i.getAttribute("name").catch(() => "")) || "";
    const value = (await i.getAttribute("value").catch(() => "")) || "";
    console.log(`  > radio id="${id}" name="${name}" value="${value}"`);
  }
  await ss(page, "A2-no-radio");
} else {
  await ss(page, "A2-manual-radio-clicked");
  // Save
  const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
  if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    for (let i = 0; i < 10 && !(await saveBtn.isEnabled().catch(() => false)); i++) {
      await page.waitForTimeout(500);
    }
    if (await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(4000);
      console.log("[asc] *** 1.0.2 release flipped to Manual ***");
    } else {
      console.log("[asc] Save not enabled — radio click may have failed");
    }
  } else {
    console.log("[asc] no Save button found");
  }
  await ss(page, "A3-save-result");
}

// =============================================================================
// PHASE B — create + submit 1.0.3
// =============================================================================
console.log("[asc] === PHASE B: create 1.0.3 + attach build 14 ===");

// Apple offers a "+ Add Version or Platform" button on the app's
// distribution page. Navigate back to the app root.
await page.goto(
  `https://appstoreconnect.apple.com/apps/${APP_ID}/distribution`,
  { timeout: 60000, waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(3000);
await ss(page, "B1-distribution");

// Find a button/link to add a new version. Labels seen in ASC UI:
//   - "iOS App" sidebar item with a "+" badge
//   - "+ New Version" or "+ Add Version" or "+ Version or Platform"
async function clickAddVersion() {
  const candidates = [
    page.getByRole("button", { name: /(\+\s*)?(New|Add)\s*(iOS\s*)?Version/i }).first(),
    page.getByRole("link", { name: /(\+\s*)?(New|Add)\s*(iOS\s*)?Version/i }).first(),
    page.locator("[aria-label*='Add Version' i]").first(),
    page.locator("[aria-label*='Add iOS Version' i]").first(),
    page.locator("[aria-label*='New Version' i]").first(),
  ];
  for (const c of candidates) {
    if (await c.isVisible({ timeout: 2000 }).catch(() => false)) {
      await c.click();
      await page.waitForTimeout(2000);
      console.log("[asc] clicked Add Version");
      return true;
    }
  }
  return false;
}

let openedAddVersion = await clickAddVersion();
if (!openedAddVersion) {
  console.log("[asc] no Add Version button visible — dumping page");
  await dumpButtons(page, "B-distribution");
  // Try clicking the "+" pill near "iOS App" sidebar
  const plus = page.locator("text=iOS App").locator("..").locator("[aria-label*='Add' i]").first();
  if (await plus.isVisible({ timeout: 2000 }).catch(() => false)) {
    await plus.click();
    await page.waitForTimeout(1500);
    openedAddVersion = true;
    console.log("[asc] clicked + next to iOS App");
  }
}

if (openedAddVersion) {
  await ss(page, "B2-add-version-modal");
  // Fill version number
  const versionInput = page.locator("input").filter({ hasText: "" }).first();
  // More targeted: input near label "Version Number" or placeholder "1.0"
  const candidates = [
    page.getByLabel(/Version Number/i).first(),
    page.locator("input[placeholder*='1.0' i]").first(),
    page.locator("input[type='text']").first(),
  ];
  let versionFilled = false;
  for (const c of candidates) {
    if (await c.isVisible({ timeout: 2000 }).catch(() => false)) {
      await c.click();
      await c.fill("");
      await c.fill(NEW_VERSION);
      versionFilled = true;
      console.log("[asc] filled version number");
      break;
    }
  }
  if (!versionFilled) {
    console.log("[asc] couldn't find version number input");
  }
  await ss(page, "B3-version-filled");

  const create = page.getByRole("button", { name: /^(Create|Add|Save|OK)$/i }).first();
  if (await create.isVisible({ timeout: 3000 }).catch(() => false)) {
    await create.click();
    await page.waitForTimeout(5000);
    console.log("[asc] created version", NEW_VERSION);
  }
  await ss(page, "B4-version-created");
} else {
  console.log("[asc] *** could not open Add Version modal — aborting ***");
  await ss(page, "B-FAIL-no-add-version");
  // Don't close — keep window so user can take over
  console.log("[asc] window kept open for manual takeover (5 min)");
  await page.waitForTimeout(300000);
  await browser.close();
  process.exit(2);
}

// Now we should be on the 1.0.3 in-flight version page.
console.log("[asc] navigating to 1.0.3 inflight page");
await page.goto(
  `https://appstoreconnect.apple.com/apps/${APP_ID}/distribution/ios/version/inflight`,
  { timeout: 60000, waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(4000);
await ss(page, "B5-inflight-loaded");

// Find Add Build / Build picker
async function openBuildPicker() {
  const candidates = [
    page.getByRole("button", { name: /(Add|Select).*Build/i }).first(),
    page.locator("[aria-label*='Add Build' i]").first(),
    page.locator("[aria-label*='Build' i][role='button']").first(),
  ];
  for (const c of candidates) {
    if (await c.isVisible({ timeout: 2000 }).catch(() => false)) {
      await c.click();
      await page.waitForTimeout(2500);
      return true;
    }
  }
  return false;
}

let pickerOpened = false;
for (let attempt = 0; attempt < 12; attempt++) {
  if (await openBuildPicker()) {
    pickerOpened = true;
    break;
  }
  console.log(`[asc] build picker not visible — refresh + wait 30s (attempt ${attempt + 1}/12)`);
  await page.waitForTimeout(30000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

if (!pickerOpened) {
  console.log("[asc] never found Add Build button — dump");
  await dumpButtons(page, "B-no-picker");
  await ss(page, "B-FAIL-no-picker");
} else {
  await ss(page, "B6-picker-open");

  // Wait for build 14 to show up (TestFlight processing)
  let buildFound = false;
  for (let attempt = 0; attempt < 16; attempt++) {
    const txt = await page.evaluate(() => document.body.innerText);
    if (txt.includes(`${NEW_VERSION} (${TARGET_BUILD_NUMBER})`)) {
      buildFound = true;
      console.log(`[asc] ${NEW_VERSION} (${TARGET_BUILD_NUMBER}) is processed`);
      break;
    }
    console.log(`[asc] waiting for ${NEW_VERSION} (${TARGET_BUILD_NUMBER}) to process — 30s (${attempt + 1}/16)`);
    await page.waitForTimeout(30000);
  }

  if (!buildFound) {
    console.log("[asc] build never appeared — abort");
    await ss(page, "B-FAIL-no-build");
  } else {
    // Click row containing 1.0.3 (14)
    const rows = await page.locator("tr, li, [role='option'], [role='row']").all();
    for (const row of rows) {
      const t = ((await row.textContent().catch(() => "")) || "").trim();
      if (t.includes(`${NEW_VERSION} (${TARGET_BUILD_NUMBER})`)) {
        await row.click();
        await page.waitForTimeout(1500);
        console.log("[asc] clicked build row");
        break;
      }
    }
    const done = page.getByRole("button", { name: /^(Done|Select|Add)$/i }).first();
    if (await done.isVisible({ timeout: 3000 }).catch(() => false)) {
      await done.click();
      await page.waitForTimeout(3000);
    }
    await ss(page, "B7-build-attached");

    // ---- Update What's New ----
    const tas = await page.locator("textarea").all();
    for (const ta of tas) {
      const id = (await ta.getAttribute("id").catch(() => "")) || "";
      const name = (await ta.getAttribute("name").catch(() => "")) || "";
      const ph = ((await ta.getAttribute("placeholder").catch(() => "")) || "").toLowerCase();
      const labelledBy = (await ta.getAttribute("aria-labelledby").catch(() => "")) || "";
      const surrounding = `${id} ${name} ${ph} ${labelledBy}`.toLowerCase();
      if (
        surrounding.includes("whatsnew") ||
        surrounding.includes("what.s.new") ||
        ph.includes("what's new") ||
        surrounding.includes("releasenotes") ||
        surrounding.includes("release-notes")
      ) {
        await ta.click();
        await page.keyboard.press("Meta+A");
        await page.keyboard.press("Delete");
        await ta.fill(WHATS_NEW);
        console.log("[asc] What's New filled");
        break;
      }
    }

    // ---- Update Reviewer Notes ----
    for (const ta of tas) {
      const id = (await ta.getAttribute("id").catch(() => "")) || "";
      const name = (await ta.getAttribute("name").catch(() => "")) || "";
      const ph = ((await ta.getAttribute("placeholder").catch(() => "")) || "").toLowerCase();
      const labelledBy = (await ta.getAttribute("aria-labelledby").catch(() => "")) || "";
      const surrounding = `${id} ${name} ${ph} ${labelledBy}`.toLowerCase();
      if (
        surrounding.includes("note") ||
        surrounding.includes("reviewinfo") ||
        surrounding.includes("review-info")
      ) {
        await ta.click();
        await page.keyboard.press("Meta+A");
        await page.keyboard.press("Delete");
        await ta.fill(REVIEW_NOTES);
        console.log("[asc] Reviewer Notes filled");
        break;
      }
    }

    // ---- Reviewer creds ----
    const inputs = await page.locator("input").all();
    for (const inp of inputs) {
      const ph = ((await inp.getAttribute("placeholder").catch(() => "")) || "").toLowerCase();
      const type = (await inp.getAttribute("type").catch(() => "")) || "";
      if (ph.match(/user.?name|email|sign.?in/) && type !== "password") {
        await inp.fill(REVIEWER_EMAIL);
      }
      if (type === "password" || ph.includes("password")) {
        await inp.fill(REVIEWER_PASSWORD);
      }
    }
    await ss(page, "B8-notes-filled");

    // ---- Save ----
    const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (let i = 0; i < 10 && !(await saveBtn.isEnabled().catch(() => false)); i++) {
        await page.waitForTimeout(500);
      }
      if (await saveBtn.isEnabled().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(4000);
        console.log("[asc] saved");
      }
    }
    await ss(page, "B9-saved");

    // ---- Submit for Review ----
    const submitBtn = page.getByRole("button", { name: /(Submit|Add).*Review/i }).first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      const conf = page.getByRole("button", { name: /^(Submit|Confirm|Yes)$/i }).first();
      if (await conf.isVisible({ timeout: 5000 }).catch(() => false)) {
        await conf.click();
        await page.waitForTimeout(5000);
      }
      console.log("[asc] *** SUBMITTED 1.0.3 (14) FOR REVIEW ***");
      await ss(page, "B10-submitted");
    } else {
      console.log("[asc] no Submit for Review button");
      await ss(page, "B10-no-submit");
    }
  }
}

console.log("[asc] final URL:", page.url());
console.log("[asc] keeping window open for 90s so you can verify");
await page.waitForTimeout(90000);
await browser.close();
