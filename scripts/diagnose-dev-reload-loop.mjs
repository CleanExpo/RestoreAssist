#!/usr/bin/env node
/**
 * RA-8478 — diagnose the `next dev` reload loop.
 *
 * Symptom seen on the Mac Mini: every page reloads ~5 times a second because,
 * on each HMR socket connect, Turbopack sends a `turbopack-message` whose
 * update type is "restart". It did not reproduce on a clean Linux checkout
 * (Next 16.4.5 and 16.4.6), so the trigger is something local to the machine.
 *
 * This script runs against a dev server that is ALREADY running
 * (`npm run dev` in another terminal) and, for a fixed window:
 *   1. opens the page in headless Chromium and records every HMR WebSocket
 *      frame, page load and socket connect, keeping each "restart" payload
 *      (it names the chunk list Turbopack gave up on);
 *   2. watches the repo for files changing on disk (skipping node_modules,
 *      .git and .next, but including node_modules/.prisma), so a file that
 *      is rewritten every cycle shows up by name.
 * It proves its own file watcher works by writing a probe file first, and
 * exits 2 if the probe is not seen, so a silent watcher is never read as
 * "no files changed".
 *
 * Usage:
 *   node scripts/diagnose-dev-reload-loop.mjs [--url http://localhost:3000/login] [--seconds 30]
 * Add --chromium <path> if Playwright's pinned Chromium is not installed.
 *
 * Exit codes: 0 no reloads, 1 the page reloaded (restart/reloadPage frame or
 * more than one load), 2 setup failure.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_TOP_LEVEL = new Set(["node_modules", ".git", ".next"]);
const PROBE_NAME = ".ra-8478-watch-probe";

function parseArgs(argv) {
  const args = {
    url: "http://localhost:3000/login",
    seconds: 30,
    chromium: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[++i];
    else if (argv[i] === "--seconds") args.seconds = Number(argv[++i]);
    else if (argv[i] === "--chromium") args.chromium = argv[++i];
  }
  if (!Number.isFinite(args.seconds) || args.seconds <= 0) {
    throw new Error("--seconds must be a positive number");
  }
  return args;
}

function startWatchers(root, t0) {
  const changes = [];
  const watchers = [];
  const record = (base) => (event, file) => {
    if (!file) return;
    const rel = path.join(base, String(file));
    changes.push({ ms: Date.now() - t0, event, file: rel });
  };
  // Root itself, non-recursively, so top-level files are covered.
  watchers.push(fs.watch(root, record(".")));
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_TOP_LEVEL.has(entry.name)) continue;
    try {
      watchers.push(
        fs.watch(
          path.join(root, entry.name),
          { recursive: true },
          record(entry.name),
        ),
      );
    } catch (error) {
      console.warn(`[watch] could not watch ${entry.name}: ${error.message}`);
    }
  }
  // Generated Prisma client: a lead from the original report.
  const prismaDir = path.join(root, "node_modules", ".prisma");
  if (fs.existsSync(prismaDir)) {
    watchers.push(
      fs.watch(prismaDir, { recursive: true }, record("node_modules/.prisma")),
    );
  }
  return { changes, close: () => watchers.forEach((w) => w.close()) };
}

async function proveWatcherWorks(root, changes) {
  const probe = path.join(root, PROBE_NAME);
  fs.writeFileSync(probe, String(Date.now()));
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (changes.some((c) => c.file.endsWith(PROBE_NAME))) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  fs.rmSync(probe, { force: true });
  await new Promise((r) => setTimeout(r, 300));
  const seen = changes.some((c) => c.file.endsWith(PROBE_NAME));
  // Drop the probe's own events from the report.
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    if (changes[i].file.endsWith(PROBE_NAME)) changes.splice(i, 1);
  }
  return seen;
}

async function launchChromium(executablePath) {
  const { chromium } = await import("playwright");
  return chromium.launch(executablePath ? { executablePath } : {});
}

async function main() {
  const { url, seconds, chromium } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "package.json"))) {
    console.error("Run this from the repository root.");
    process.exit(2);
  }

  const t0 = Date.now();
  const watch = startWatchers(root, t0);
  if (!(await proveWatcherWorks(root, watch.changes))) {
    watch.close();
    console.error(
      "[watch] probe file was not seen: the file watcher is not working, so its result would mean nothing.",
    );
    process.exit(2);
  }

  const browser = await launchChromium(chromium);
  const page = await browser.newPage();
  const stats = {
    loads: 0,
    wsConnects: 0,
    frames: 0,
    restarts: [],
    reloadPages: [],
  };
  const frameTypes = {};
  page.on("load", () => {
    stats.loads += 1;
  });
  page.on("websocket", (ws) => {
    stats.wsConnects += 1;
    ws.on("framereceived", (frame) => {
      stats.frames += 1;
      let msg;
      try {
        msg = JSON.parse(String(frame.payload));
      } catch {
        return;
      }
      const key = `${msg.type ?? msg.action ?? "?"}${msg.data?.type ? `:${msg.data.type}` : ""}`;
      frameTypes[key] = (frameTypes[key] ?? 0) + 1;
      // Turbopack chunk-list update that cannot be applied: the client reloads.
      if (/"type"\s*:\s*"restart"/.test(String(frame.payload))) {
        stats.restarts.push({
          ms: Date.now() - t0,
          payload: String(frame.payload).slice(0, 600),
        });
      }
      // Server-ordered full reload; `data` says why (e.g. "HMR hash mismatch").
      if (msg.type === "reloadPage") {
        stats.reloadPages.push({
          ms: Date.now() - t0,
          reason: String(msg.data ?? "").slice(0, 300),
        });
      }
    });
  });

  console.log(
    `[run] ${url} for ${seconds}s (dev server must already be running)`,
  );
  const windowStart = Date.now() - t0;
  await page.goto(url, { waitUntil: "load", timeout: 180_000 });
  const networkidle = await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .then(() => "reached")
    .catch(() => "timed out");
  await page.waitForTimeout(
    Math.max(0, seconds * 1000 - (Date.now() - t0 - windowStart)),
  );
  await browser.close();
  watch.close();

  const changed = watch.changes.filter((c) => c.ms >= windowStart);
  const byFile = new Map();
  for (const c of changed) byFile.set(c.file, (byFile.get(c.file) ?? 0) + 1);
  const topFiles = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log("\n== HMR");
  console.log(
    `page loads: ${stats.loads}, socket connects: ${stats.wsConnects}, frames: ${stats.frames}, restart frames: ${stats.restarts.length}, reloadPage frames: ${stats.reloadPages.length}, networkidle: ${networkidle}`,
  );
  console.log(`frame types: ${JSON.stringify(frameTypes)}`);
  for (const r of stats.restarts.slice(0, 5))
    console.log(`  restart @${r.ms}ms ${r.payload}`);
  for (const r of stats.reloadPages.slice(0, 5))
    console.log(`  reloadPage @${r.ms}ms ${r.reason}`);

  console.log(
    "\n== Files changed on disk during the window (excl. node_modules, .git, .next)",
  );
  if (topFiles.length === 0) console.log("  none");
  for (const [file, count] of topFiles) console.log(`  ${count}x ${file}`);
  for (const c of changed.slice(0, 10))
    console.log(`  @${c.ms}ms ${c.event} ${c.file}`);

  console.log("\n== Verdict");
  const reloaded =
    stats.restarts.length > 0 ||
    stats.reloadPages.length > 0 ||
    stats.loads > 1;
  if (!reloaded) {
    console.log(
      "No restart or reloadPage frames and one page load: the reload loop did not happen in this window.",
    );
    process.exit(0);
  }
  if (topFiles.length > 0) {
    console.log(
      `Page reloaded (${stats.loads} loads) and these files changed while it ran; the most frequent is the likely trigger: ${topFiles[0][0]}`,
    );
  } else {
    console.log(
      `Page reloaded (${stats.loads} loads) but no watched file changed. ` +
        "The trigger is not a file rewrite in the repo. " +
        "Next checks: stop the server, `rm -rf .next` (stale Turbopack cache), make sure only one dev server " +
        "owns the port (`lsof -iTCP:3000 -sTCP:LISTEN`), and re-run.",
    );
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
