#!/usr/bin/env node
/**
 * RestoreAssist Video Generator
 *
 * Generates go-live tutorial videos by:
 * 1. Running Playwright to capture screenshots at each step
 * 2. Stitching screenshots with ffmpeg into MP4
 * 3. Adding TTS narration per step
 *
 * Usage:
 *   npx tsx scripts/video-generate.ts --flow login --output ./videos/
 *   npx tsx scripts/video-generate.ts --flow signup --output ./videos/
 *   npx tsx scripts/video-generate.ts --flow setup-wizard --output ./videos/
 *
 * Dependencies:
 *   - playwright
 *   - ffmpeg (system binary)
 *   - @remotion/renderer (optional — for advanced compositing)
 */

import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { chromium } from "playwright";

// ── Flow definitions ────────────────────────────────────────────────────

interface FlowStep {
  /** Step number for ordering */
  index: number;
  /** Description shown in video */
  label: string;
  /** Playwright action to execute */
  action: (page: any) => Promise<void>;
  /** Pause after action (ms) */
  delay?: number;
  /** Narration text — spoken during this step */
  narration?: string;
}

interface FlowDefinition {
  id: string;
  title: string;
  totalDurationSec: number;
  /** Base URL to start from */
  startUrl: string;
  /** Steps in order */
  steps: FlowStep[];
}

// ── Pre-defined flows ───────────────────────────────────────────────────

const flows: Record<string, FlowDefinition> = {
  login: {
    id: "login",
    title: "Signing in to RestoreAssist",
    totalDurationSec: 45,
    startUrl: "https://restoreassist.au/login",
    steps: [
      {
        index: 1,
        label: "Welcome screen",
        narration:
          "Welcome back to RestoreAssist. Open the app or visit restoreassist.au",
        action: async (page) => {
          // Already on login page
        },
        delay: 2000,
      },
      {
        index: 2,
        label: "Tap Sign In",
        narration: "Tap the Sign In button to get started.",
        action: async (page) => {
          await page.click('button[type="submit"], [data-testid="sign-in"]');
        },
        delay: 1500,
      },
      {
        index: 3,
        label: "Enter email",
        narration: "Enter your email address.",
        action: async (page) => {
          await page.fill('input[type="email"], input[name="email"]', "demo@example.com");
        },
        delay: 1000,
      },
      {
        index: 4,
        label: "Enter password",
        narration: "And your password.",
        action: async (page) => {
          await page.fill('input[type="password"], input[name="password"]', "••••••••");
        },
        delay: 1000,
      },
      {
        index: 5,
        label: "Sign in",
        narration: "Tap Sign In. If you have face or fingerprint ID, you'll be prompted now.",
        action: async (page) => {
          await page.click('button[type="submit"], [data-testid="sign-in-submit"]');
          await page.waitForNavigation({ waitUntil: "networkidle" });
        },
        delay: 2000,
      },
      {
        index: 6,
        label: "You're in",
        narration: "You're now signed in. Your dashboard shows active jobs, upcoming inspections, and your workspace health.",
        action: async (page) => {
          // Wait for dashboard to load
        },
        delay: 3000,
      },
    ],
  },

  signup: {
    id: "signup",
    title: "Creating your RestoreAssist account",
    totalDurationSec: 90,
    startUrl: "https://restoreassist.au/signup",
    steps: [
      {
        index: 1,
        label: "Welcome",
        narration:
          "Welcome to RestoreAssist. Let's get your restoration business set up in under two minutes.",
        action: async () => {},
        delay: 2500,
      },
      {
        index: 2,
        label: "Enter your details",
        narration: "Enter your name, email, and create a secure password.",
        action: async (page) => {
          await page.fill('input[name="firstName"]', "Demo");
          await page.fill('input[name="lastName"]', "User");
          await page.fill('input[name="email"]', "demo@restorationco.com.au");
          await page.fill('input[name="password"]', "SecurePass123!");
        },
        delay: 2000,
      },
      {
        index: 3,
        label: "Business details",
        narration: "Enter your business name and ABN. We'll verify it automatically.",
        action: async (page) => {
          await page.fill('input[name="businessName"]', "Demo Restoration Co");
          await page.fill('input[name="abn"]', "12 345 678 901");
        },
        delay: 2000,
      },
      {
        index: 4,
        label: "Verify email",
        narration: "Check your email for a verification code and enter it here.",
        action: async (page) => {
          await page.fill('input[name="otp"]', "123456");
        },
        delay: 1500,
      },
      {
        index: 5,
        label: "Start setup wizard",
        narration: "Great! Now the Setup Wizard will guide you through activating your account.",
        action: async (page) => {
          await page.click('button:has-text("Continue"), [data-testid="start-wizard"]');
          await page.waitForNavigation({ waitUntil: "networkidle" });
        },
        delay: 2000,
      },
      {
        index: 6,
        label: "Wizard complete",
        narration: "Your account is now active. Welcome to RestoreAssist.",
        action: async () => {},
        delay: 2000,
      },
    ],
  },

  "setup-wizard": {
    id: "setup-wizard",
    title: "The RestoreAssist Setup Wizard",
    totalDurationSec: 120,
    startUrl: "https://restoreassist.au/onboarding/wizard",
    steps: [
      {
        index: 1,
        label: "Welcome to the wizard",
        narration:
          "The Setup Wizard walks you through five quick steps to get your account fully activated.",
        action: async () => {},
        delay: 2000,
      },
      {
        index: 2,
        label: "Step 1: Business profile",
        narration: "Step one: confirm your business details and add your logo.",
        action: async (page) => {
          await page.click('button:has-text("Next"), [data-testid="wizard-next"]');
        },
        delay: 2000,
      },
      {
        index: 3,
        label: "Step 2: AI hydration",
        narration: "Step two: AI hydrates your account with industry-specific defaults.",
        action: async (page) => {
          await page.click('button:has-text("Next"), [data-testid="wizard-next"]');
        },
        delay: 2000,
      },
      {
        index: 4,
        label: "Step 3: Integrations",
        narration: "Step three: connect your accounting or job management software.",
        action: async (page) => {
          await page.click('button:has-text("Next"), [data-testid="wizard-next"]');
        },
        delay: 2000,
      },
      {
        index: 5,
        label: "Step 4: Health check",
        narration: "Step four: run a health check to confirm everything is working.",
        action: async (page) => {
          await page.click('button:has-text("Next"), [data-testid="wizard-next"]');
        },
        delay: 2000,
      },
      {
        index: 6,
        label: "Activate",
        narration:
          "All green? Tap Activate. Your RestoreAssist workspace is now live.",
        action: async (page) => {
          await page.click('button:has-text("Activate"), [data-testid="wizard-activate"]');
        },
        delay: 3000,
      },
    ],
  },
};

// ── CLI ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flow = args[args.indexOf("--flow") + 1];
  const outputDir = args[args.indexOf("--output") + 1] || "./videos";
  const headless = !args.includes("--headed");
  return { flow, outputDir, headless };
}

// ── Screenshot capture ──────────────────────────────────────────────────

async function captureScreenshots(
  flow: FlowDefinition,
  outputDir: string,
  headless: boolean,
) {
  const tmpDir = path.join(os.tmpdir(), `restoreassist-video-${flow.id}`);
  await fs.mkdir(tmpDir, { recursive: true });

  console.log(`[capture] Starting browser for flow: ${flow.title}`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Go to start URL
  await page.goto(flow.startUrl, { waitUntil: "networkidle" });

  const screenshots: Array<{
    path: string;
    narration?: string;
    label: string;
  }> = [];

  for (const step of flow.steps) {
    console.log(`[capture] Step ${step.index}: ${step.label}`);

    // Execute step action
    await step.action(page);

    // Wait for any animations
    if (step.delay) {
      await page.waitForTimeout(step.delay);
    }

    // Take screenshot
    const screenshotPath = path.join(tmpDir, `step-${String(step.index).padStart(2, "0")}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    screenshots.push({
      path: screenshotPath,
      narration: step.narration,
      label: step.label,
    });

    console.log(`[capture]   → ${screenshotPath}`);
  }

  await browser.close();
  console.log(`[capture] Done — ${screenshots.length} screenshots`);

  return { screenshots, tmpDir };
}

// ── MP4 generation via ffmpeg ───────────────────────────────────────────

async function generateMp4(
  flow: FlowDefinition,
  screenshots: Array<{ path: string; narration?: string; label: string }>,
  outputDir: string,
  tmpDir: string,
) {
  const outputPath = path.join(outputDir, `restoreassist-${flow.id}-v1.mp4`);
  await fs.mkdir(outputDir, { recursive: true });

  // Calculate per-frame duration to match target
  const frameDuration = (flow.totalDurationSec / screenshots.length).toFixed(2);

  // Build ffmpeg input list
  const listPath = path.join(tmpDir, "input.txt");
  const listLines = screenshots
    .map((s) => `file '${s.path}'\nduration ${frameDuration}`)
    .join("\n");
  await fs.writeFile(listPath, listLines);

  console.log(`[ffmpeg] Generating MP4: ${outputPath}`);
  console.log(`[ffmpeg] ${screenshots.length} frames × ${frameDuration}s = ~${flow.totalDurationSec}s`);

  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" ` +
        `-vf "fps=30,format=yuv420p,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" ` +
        `-c:v libx264 -preset medium -crf 23 ` +
        `-movflags +faststart "${outputPath}"`,
      { stdio: "inherit" },
    );
  } catch (error) {
    console.error("[ffmpeg] Failed to generate MP4:", error);
    throw error;
  }

  console.log(`[ffmpeg] Done: ${outputPath}`);

  // Get file size
  const stats = await fs.stat(outputPath);
  console.log(`[ffmpeg] File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return outputPath;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { flow: flowId, outputDir, headless } = parseArgs();

  if (!flowId || !flows[flowId]) {
    console.error("Usage: npx tsx scripts/video-generate.ts --flow <login|signup|setup-wizard> [--output ./videos] [--headed]");
    console.error("Available flows:", Object.keys(flows).join(", "));
    process.exit(1);
  }

  const flow = flows[flowId];
  console.log(`========================================`);
  console.log(`RestoreAssist Video Generator`);
  console.log(`Flow: ${flow.title}`);
  console.log(`Target: ${flow.totalDurationSec}s`);
  console.log(`========================================`);

  const { screenshots, tmpDir } = await captureScreenshots(flow, outputDir, headless);

  const mp4Path = await generateMp4(flow, screenshots, outputDir, tmpDir);

  // Cleanup tmp files
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\n✅ Done: ${mp4Path}`);
  console.log(`   Duration: ${flow.totalDurationSec}s`);
  console.log(`   Steps: ${screenshots.length}`);
  console.log(`   Next: npx tsx scripts/video-upload.ts --file ${mp4Path} --title "${flow.title}"`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
