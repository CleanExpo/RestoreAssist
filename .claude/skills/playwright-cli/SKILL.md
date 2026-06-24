---
name: playwright-cli
description: Capture browser screenshots for visual design verification (DESIGN.md Verification Gate). Use when a UI change needs an actual rendered screenshot — de-gradient passes, layout/spacing checks, light/dark comparison — rather than a static class diff. Covers the managed/remote-env quirks (browser install via resumable download, full-chrome headless launch, localhost-only page loads).
---

# Playwright CLI — visual verification

Turns "I can't see it headless" into a real screenshot. Use it to satisfy the
DESIGN.md **Verification Gate** with rendered evidence instead of inferring from
class diffs.

## One-time setup (per fresh environment)

The managed/remote container ships an older Chromium than `@playwright/test`
needs, and `npx playwright install` is cut mid-download by the egress proxy.
The setup script works around it with a resumable download:

```bash
bash scripts/setup-playwright.sh
```

Idempotent — exits early if the right Chromium revision is already runnable.
After it runs, `chromium.executablePath()` resolves to a working full-Chrome
build under `$PLAYWRIGHT_BROWSERS_PATH`.

## Taking a screenshot

```bash
# dark mode (default), full page
node scripts/screenshot.mjs http://localhost:3000/ shots/landing.png 1440 900
# light + dark in one go
node scripts/screenshot.mjs http://localhost:3000/dashboard shots/dash.png --both
```

Then **view the PNG** (Read tool on the file) — looking at it is the point.

## Hard environment limits (read before screenshotting a URL)

- **localhost / data URLs work.** They bypass the egress proxy (`noProxy`).
- **Remote https URLs DO NOT work.** The proxy closes Chromium's tunnel
  (`ERR_CONNECTION_CLOSED`) for every external host — Vercel previews,
  production, example.com alike. This is an env policy limit, not a bug; do not
  try to disable TLS or unset `HTTPS_PROXY` to route around it.
- **To verify a deployed change, run it locally and screenshot localhost:**
  ```bash
  pnpm build && pnpm start &   # or: pnpm dev
  # wait for http://localhost:3000 to answer, then:
  node scripts/screenshot.mjs http://localhost:3000/ shots/x.png --both
  ```
- The launcher uses `executablePath: chromium.executablePath()` + `--no-sandbox`
  on purpose: the default `launch()` wants `chromium-headless-shell` (not
  installed; same proxy download problem), and the container has no user
  namespace. Keep both.

## When NOT to use this

- Pure class-token swaps already covered by `rg`/eslint static checks — a
  screenshot adds nothing.
- Anything requiring a remote URL with no local run path — fall back to the
  Vercel preview deploy + human review (document that you couldn't screenshot).

## Companion: Playwright MCP

`.mcp.json` registers `@playwright/mcp` for interactive browser-driving tools
(navigate, click, snapshot) in future sessions. It loads at **session start**,
so it is not available in the session that adds it — restart to pick it up. It
inherits the same localhost-only network limit above.
