<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Premium Visual & Motion Standard (HARD RULE — Phill McGurk, 2 Nov 2026)

This applies to every page a customer can see. It is enforced in CI by `check-visuals`; a PR that fails it is not done.

1. **No code-drawn graphics.** Zero TypeScript/CSS/SVG/canvas illustrations, decorative shapes, conic/radial gradient "art", clip-path shapes or placeholder images. UI icons come from a real icon set (lucide-react); logos are marked `data-pv-allow="logo"`.
2. **Real media only, in this order:** the client's own photos/video → licensed real stock (downloaded and self-hosted, never hot-linked) → Higgsfield photoreal images/video using the `cinematic-au-restoration` preset → Blender renders for products/equipment (offline turntables, never heavy runtime WebGL). Every file is listed in `media.manifest.json` with `source` (client|stock|generated|blender), `credit` and `alt`.
3. **Every marketing page uses the standard package** `@cleanexpo/premium-visuals`: `<PremiumHero>` with a muted, looping, lazy-loaded video (AV1 MP4 + WebM + H.264 MP4, poster required) or a real photo; at least one `<MotionSection>`; `<Carousel>` (Embla) for galleries, testimonials, services/courses; page transitions via `navigateWithTransition`/View Transitions; all motion honours `prefers-reduced-motion`. Start new pages from `scripts/premium-visuals/marketing-page.template.tsx.txt`.
4. **Premium type and layout:** Fraunces display + Manrope body + JetBrains Mono data via next/font (or the repo's approved brand system). No system/Inter/Roboto/Arial.
5. **Media budgets:** AVIF/WebP images ≤ 450 KB, videos ≤ 6 MB, no PNG/JPG > 80 KB, no .mov.
6. **Visibility pillars first:** Find → Crawl → Index → Ranking are set up before any SEO/AEO/GEO tactics.
7. **Process:** plan the page with the **SPM** skill (`/spm` — spec before build, include the media plan and prompt manifest), then pass the **SDA visual and commercial evidence gate** (`skills/visual-qa`, `sda_evidence_gate.py`: real Playwright screenshots at 390/768/1440, reduced-motion check, video frame review, named SDA rubric). Non-zero = HOLD.
8. Generate media with `npx generate-media --prompts media.prompts.json` (dry run by default; `--go` uses the existing Higgsfield plan; keys from env, never printed). Render 3D with `npx blender-render model.glb --id <id>`.
