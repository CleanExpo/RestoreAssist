# Security Advisories — Risk Assessments

Documented audit decisions for CVEs affecting RestoreAssist dependencies.

## Ignored (with rationale)

### GHSA-hfvx-25r5-qc3w — Fabric.js Stored XSS via SVG Export

- **Package:** `fabric@6.9.1`
- **Affected versions:** `< 7.2.0`
- **Patched:** `>= 7.2.0`
- **Severity:** High
- **Exploitable in RestoreAssist?** **No.**

#### Risk assessment

The CVE is triggered only when `fabric.Canvas.toSVG()` is called on a canvas containing an attacker-controlled object and the resulting SVG string is rendered back to a browser. The attack payload travels via the SVG export path.

**RestoreAssist does not export SVG from Fabric.js.** Grep confirmed zero occurrences of `toSVG`, `exportSVG`, or any SVG export API across the entire codebase. The sketch editor (`components/sketch/SketchEditor.tsx`, `components/sketch/SketchCanvas.tsx`) exports canvases only two ways:

1. `toDataURL({ format: "png", multiplier: 2 })` — raster PNG data URL
2. `toJSON()` — serialised object graph for sketch persistence + undo/redo history

Neither code path hits the vulnerable SVG serializer.

#### Why not upgrade to 7.2.0?

Fabric 7.x ships breaking changes that would silently corrupt every sketch produced under Fabric 6:

- **Origin defaults changed** from `"left"/"top"` to `"center"/"center"`. The sketch editor positions shapes with `{ left: x - 5, top: y - 5 }` assuming left/top origin — under Fabric 7, every circle, line, polygon, and measurement label would be offset by half its bounding box. Existing customer sketches loaded from `toJSON()` persistence would reposition.
- Text positioning changes affect `IText` labels used for measurement and photo markers.
- The `Canvas` event binding for `mouse:down`, `object:modified`, and `loadFromJSON` callback signatures have tighter typing.

A Fabric 6 → 7 upgrade is a dedicated, planned project with a full regression pass of the sketch editor — not a drive-by CVE fix.

#### Ignored in

`package.json` → `pnpm.auditConfig.ignoreGhsas` — this prevents `pnpm audit` from failing CI on this specific advisory while still reporting any new advisories that appear.

#### Revisit if

- Any new code path calls `canvas.toSVG()` or exports sketch data as SVG
- Fabric.js ships a backport patch to the 6.x line
- The sketch editor is planned for a major refactor and the Fabric 7 migration can ride along

---

## Deferred (from pre-launch security swarm)

These items were flagged during the 2026-04-07 security audit and are tracked in `.claude/PROGRESS.md`:

- **F5** — In-memory rate limiter resets on cold starts. Code supports Upstash Redis fallback; only needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars in Vercel.
- **F13** — jsPDF CVEs. Pending patched version release.
- **F15** — CSP `unsafe-inline`/`unsafe-eval`. Needs nonce-based CSP; blocked by Next.js RSC hydration which requires `unsafe-inline` for `self.__next_f.push` until a future Next.js release.
- **F2** — `session.user.email` references across 30+ routes. Largely migrated to `session.user.id` in `1bcc8540`; remaining uses are Stripe customer email (correct) or low-risk fallbacks.
