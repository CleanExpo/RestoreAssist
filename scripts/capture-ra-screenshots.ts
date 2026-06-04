/**
 * @file scripts/capture-ra-screenshots.ts
 * Playwright pipeline: capture actual RestoreAssist UI screenshots for video composition.
 *
 * Usage:
 *   pnpm exec tsx scripts/capture-ra-screenshots.ts --env local|staging|prod
 *
 * Requirements for local capture:
 *   1. Dev server running on http://localhost:3000
 *   2. Demo account seeded (demo@restoreassist.com.au / DemoAccount-2024)
 *
 * Requirements for prod capture:
 *   1. Valid session cookie or credentials
 *   2. The capture will screenshot accessible public pages only
 *   3. For authed pages, provide AUTH_TOKEN env var with bearer token
 */

import {chromium, type Browser, type Page} from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/* ── Config ─────────────────────────────────────────────────────────── */

const VIEWPORT = {width: 1920, height: 1080};
const MOBILE_VIEWPORT = {width: 390, height: 844};
const OUTPUT_DIR = path.join(process.cwd(), 'remotion', 'assets', 'screenshots');

interface CaptureSpec {
  id: string;
  url: string;
  viewport?: typeof VIEWPORT;
  auth?: boolean;
  customAction?: (page: Page) => Promise<void>;
}

/* ── Capture spec — maps actual RA pages to video needs ─────────────── */

const SPECS: CaptureSpec[] = [
  {
    id: 'dashboard',
    url: '/dashboard',
    auth: true,
    customAction: async (page) => {
      await page.waitForSelector('[data-testid="dashboard-stats-grid"]', {timeout: 10000}).catch(() => {});
      await page.waitForTimeout(1000);
    },
  },
  {
    id: 'sign-in',
    url: '/login',
    auth: false,
  },
  {
    id: 'sign-up',
    url: '/register', 
    auth: false,
  },
  {
    id: 'create-inspection',
    url: '/inspections/new',
    auth: true,
  },
  {
    id: 'inspections-list',
    url: '/inspections',
    auth: true,
    customAction: async (page) => {
      await page.waitForTimeout(800);
    },
  },
  {
    id: 'report-builder',
    url: '/reports',
    auth: true,
  },
  {
    id: 'client-portal',
    url: '/clients',
    auth: true,
  },
  {
    id: 'team-management',
    url: '/team',
    auth: true,
  },
  {
    id: 'compliance-checklists',
    url: '/compliance',
    auth: true,
  },
  {
    id: 'analytics-overview',
    url: '/analytics',
    auth: true,
  },
  {
    id: 'invoice-generator',
    url: '/invoices',
    auth: true,
  },
  {
    id: 'quote-builder',
    url: '/quotes',
    auth: true,
  },
  {
    id: 'moisture-mapping',
    url: '/inspections/*/readings',
    auth: true,
  },
  {
    id: 'evidence-capture',
    url: '/inspections/*/evidence',
    auth: true,
  },
  {
    id: 'mobile-workflow',
    url: '/dashboard',
    viewport: MOBILE_VIEWPORT,
    auth: true,
  },
  {
    id: 'pricing-overview',
    url: '/pricing',
    auth: false,
  },
];

/* ── Environment resolution ─────────────────────────────────────────── */

function getBaseUrl(): string {
  const env = process.argv.find(a => a.startsWith('--env='))?.split('=')[1] || 'staging';
  
  switch (env) {
    case 'local': return 'http://localhost:3000';
    case 'staging': return 'https://restoreassist-staging.vercel.app';
    case 'prod': return 'https://restoreassist.com.au';
    default: return 'http://localhost:3000';
  }
}

/* ── Main capture loop ──────────────────────────────────────────────── */

async function captureScreenshot(
  browser: Browser, 
  spec: CaptureSpec, 
  baseUrl: string
): Promise<string> {
  const context = await browser.newContext({
    viewport: spec.viewport || VIEWPORT,
    deviceScaleFactor: 2, // Retina-quality screenshots
  });
  
  const page = await context.newPage();
  
  // Block tracking, analytics, chat widgets for clean screenshots
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('analytics') || url.includes('intercom') || url.includes('crisp') || 
        url.includes('googletagmanager') || url.includes('hotjar')) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  const fullUrl = `${baseUrl}${spec.url}`;
  console.log(`  → Capturing ${spec.id} from ${fullUrl}`);
  
  // Auth — if AUTH_TOKEN env var is set, inject session cookie
  if (spec.auth && process.env.AUTH_TOKEN) {
    await context.addCookies([
      {
        name: 'next-auth.session-token',
        value: process.env.AUTH_TOKEN,
        domain: new URL(baseUrl).hostname,
        path: '/',
        httpOnly: true,
        secure: true,
      },
    ]);
  }
  
  try {
    await page.goto(fullUrl, {waitUntil: 'networkidle', timeout: 30000});
    
    // Custom stabilisation
    if (spec.customAction) {
      await spec.customAction(page);
    } else {
      await page.waitForTimeout(1500); // Allow animations to settle
    }
    
    // Hide dynamic elements (timestamps, user-specific data) via CSS
    await page.addStyleTag({
      content: `
        /* Hide elements that change between captures */
        [data-hide-from-screenshots],
        .live-timestamp,
        .user-email,
        .session-id,
        .notification-count {
          visibility: hidden !important;
        }
      `,
    });
    
    const filePath = path.join(OUTPUT_DIR, `${spec.id}.png`);
    await page.screenshot({
      path: filePath,
      fullPage: false,
      clip: {x: 0, y: 0, width: (spec.viewport || VIEWPORT).width, height: (spec.viewport || VIEWPORT).height},
    });
    
    console.log(`    ✓ Saved ${spec.id}.png (${(spec.viewport || VIEWPORT).width}x${(spec.viewport || VIEWPORT).height})`);
    
    await context.close();
    return filePath;
  } catch (error) {
    console.error(`    ✗ Failed to capture ${spec.id}:`, (error as Error).message);
    await context.close();
    throw error;
  }
}

/* ── CLI ────────────────────────────────────────────────────────────── */

async function main() {
  const baseUrl = getBaseUrl();
  const env = process.argv.find(a => a.startsWith('--env='))?.split('=')[1] || 'local';
  
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  RestoreAssist Screenshot Capture Pipeline                ║`);
  console.log(`║  Environment: ${env.padEnd(44)}║`);
  console.log(`║  Base URL: ${baseUrl.padEnd(47)}║`);
  console.log(`║  Output: ${OUTPUT_DIR.padEnd(49)}║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);
  
  // Filter to specific specs if --only=id provided
  const onlySpec = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
  const activeSpecs = onlySpec ? SPECS.filter(s => s.id === onlySpec) : SPECS;
  
  // Auth check
  if (activeSpecs.some(s => s.auth) && !process.env.AUTH_TOKEN) {
    console.warn(`⚠️  WARNING: Auth screenshots requested but AUTH_TOKEN not set.`);
    console.warn(`   Set with: export AUTH_TOKEN=<your-session-token>`);
    console.warn(`   Skipping authed pages...\n`);
  }
  
  await fs.mkdir(OUTPUT_DIR, {recursive: true});
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const results: {id: string; path: string; ok: boolean}[] = [];
  
  for (const spec of activeSpecs) {
    if (spec.auth && !process.env.AUTH_TOKEN) {
      results.push({id: spec.id, path: '', ok: false});
      console.log(`  ⊘ Skipping ${spec.id} (auth required)`);
      continue;
    }
    
    try {
      const filePath = await captureScreenshot(browser, spec, baseUrl);
      results.push({id: spec.id, path: filePath, ok: true});
    } catch {
      results.push({id: spec.id, path: '', ok: false});
    }
  }
  
  await browser.close();
  
  // Summary
  console.log(`\n--- Capture Complete ---`);
  console.log(`Success: ${results.filter(r => r.ok).length}/${results.length}`);
  console.log(`Failed:  ${results.filter(r => !r.ok).length}/${results.length}`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.log(`\nFailed captures:`);
    for (const f of failed) {
      console.log(`  ${f.id} — ${f.auth ? 'auth failed' : 'page error'}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
