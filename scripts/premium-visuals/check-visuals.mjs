#!/usr/bin/env node
/**
 * check-visuals — CleanExpo premium visual & motion gate. Zero dependencies (Node >= 20).
 *
 * FAILS (enforce mode) when it finds:
 *   inline-svg-art      inline <svg> that is not marked data-pv-allow="icon|logo" (use lucide/real icon sets for UI)
 *   svg-asset           .svg files in public/ that are not logos/icons/favicons or allowlisted
 *   css-art             conic/radial/repeating gradients or clip-path polygons (>=5 points) used as artwork
 *   canvas-drawing      <canvas> / getContext() drawing (light WebGL needs an allowlist entry)
 *   placeholder-host    placeholder or hot-linked stock hosts (placehold.co, picsum, unsplash CDN, ...)
 *   unmanifested-media  image/video paths used in code with no media.manifest.json entry (source + credit)
 *   manifest-invalid    manifest entries missing source (client|stock|generated|blender), credit, alt, or video poster
 *   hero-missing-media  marketing page without PremiumHero (or data-pv-hero) carrying an image or video
 *   no-motion           marketing page with no MotionSection / data-pv-motion
 *   media-budget        raster > imageMaxKB, video > videoMaxKB, or PNG/JPG > 80KB (ship AVIF/WebP)
 *
 * Usage: check-visuals [--root .] [--report-only] [--json] [--config visuals.config.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(opt('--root', '.'));
const cfgPath = path.join(root, opt('--config', 'visuals.config.json'));

const DEFAULTS = {
  mode: 'enforce',
  srcDirs: ['app', 'src', 'components', 'pages', 'apps/web'],
  publicDirs: ['public', 'apps/web/public'],
  manifest: 'media.manifest.json',
  ignore: ['node_modules', '.next', 'dist', 'build', 'out', 'coverage', '.git', '.turbo', 'storybook-static', '__tests__', 'tests', 'e2e', '.vercel'],
  allowlist: [],
  marketingPages: ['**/app/page.tsx', '**/app/**/page.tsx', '**/app/**/page.mdx', '**/pages/index.tsx'],
  nonMarketing: ['/api/', '/admin', '/dashboard', 'portal/', '/account', '/login', '/auth', '/settings', '/(app)/', '/(dashboard)/', '/(auth)/', '/(founder)/', '/(preview)/', '/app/app/', '/crm/', '/demo/', '/dev/', '/onboarding', '/invoices', '/billing', '/reports', '/setup', '/signup', '/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/invite', '/sign/', '/learn/', '/lms/', '/student', '/instructor', '/[', '/offline', '/status/', '/__tests__/'],
  budgets: { imageMaxKB: 450, videoMaxKB: 6000, legacyRasterMaxKB: 80 },
};
let cfg = { ...DEFAULTS };
if (fs.existsSync(cfgPath)) {
  const u = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg = { ...DEFAULTS, ...u, budgets: { ...DEFAULTS.budgets, ...(u.budgets || {}) } };
}
const reportOnly = flag('--report-only') || cfg.mode === 'report';

function globToRe(g) {
  let s = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { s += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') s += '[^/]*';
    else if ('.+^${}()|[]\\'.includes(c)) s += '\\' + c;
    else s += c;
  }
  return new RegExp('^' + s + '$');
}
const allowRes = cfg.allowlist.map((a) => globToRe(a.replace(/^\.\//, '')));
const allowed = (rel) => allowRes.some((r) => r.test(rel));
const mktRes = cfg.marketingPages.map(globToRe);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (cfg.ignore.includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const uniq = (a) => [...new Set(a)];

const codeExt = /\.(tsx|jsx|ts|js|mdx|html|astro|vue|svelte)$/;
const styleExt = /\.(css|scss|sass|less)$/;
const srcFiles = uniq(cfg.srcDirs.flatMap((d) => walk(path.join(root, d)))).filter((f) => codeExt.test(f) || styleExt.test(f));
const publicFiles = uniq(cfg.publicDirs.flatMap((d) => walk(path.join(root, d))));

const violations = [];
const add = (rule, file, line, detail) => violations.push({ rule, file, line, detail });
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// manifest
let manifestSrcs = new Set();
const mPath = path.join(root, cfg.manifest);
if (fs.existsSync(mPath)) {
  const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  for (const e of m.entries || []) {
    manifestSrcs.add(e.src); if (e.poster) manifestSrcs.add(e.poster);
    const miss = [];
    if (!['client', 'stock', 'generated', 'blender'].includes(e.source)) miss.push('source');
    if (!e.credit || !String(e.credit).trim()) miss.push('credit');
    if (!e.alt || !String(e.alt).trim()) miss.push('alt');
    if (e.kind === 'video' && !e.poster) miss.push('poster');
    if (miss.length) add('manifest-invalid', cfg.manifest, 0, `${e.src}: missing ${miss.join(', ')}`);
  }
}

const PLACEHOLDER = /\b(placehold\.co|placeholder\.com|via\.placeholder\.com|picsum\.photos|unsplash\.it|source\.unsplash\.com|images\.unsplash\.com|plus\.unsplash\.com|loremflickr\.com|dummyimage\.com|placekitten\.com|placeimg\.com|images\.pexels\.com|lorempixel\.com|fakeimg\.pl)\b/g;
const MEDIA_PATH = /["'`(](\/[A-Za-z0-9_\-./%@]+\.(?:avif|webp|png|jpe?g|gif|mp4|webm|mov))["'`)?]/g;

for (const f of srcFiles) {
  const r = rel(f);
  if (allowed(r)) continue;
  const t = fs.readFileSync(f, 'utf8');
  let m;
  if (codeExt.test(f)) {
    const svgRe = /<svg\b[^>]*>/g;
    while ((m = svgRe.exec(t))) {
      if (/data-pv-allow=["'](icon|logo)["']/.test(m[0])) continue;
      add('inline-svg-art', r, lineOf(t, m.index), 'inline <svg> — replace with real image/video, or a real icon set (lucide-react); logos: data-pv-allow="logo"');
    }
    const cv = /<canvas\b|\.getContext\(\s*["'](2d|webgl2?|bitmaprenderer)["']/g;
    while ((m = cv.exec(t))) add('canvas-drawing', r, lineOf(t, m.index), m[0]);
  }
  const css = /\b(conic-gradient|radial-gradient|repeating-(linear|radial|conic)-gradient)\s*\(|bg-\[(conic|radial)-gradient|bg-gradient-(conic|radial)/g;
  while ((m = css.exec(t))) add('css-art', r, lineOf(t, m.index), m[0]);
  const clip = /clip-path\s*:\s*polygon\(([^)]*)\)|\[clip-path:polygon\(([^\]]*)\)\]|clipPath\s*:\s*["']polygon\(([^)]*)\)/g;
  while ((m = clip.exec(t))) {
    const pts = (m[1] || m[2] || m[3] || '').split(',').length;
    if (pts >= 5) add('css-art', r, lineOf(t, m.index), `clip-path polygon with ${pts} points`);
  }
  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(t))) add('placeholder-host', r, lineOf(t, m.index), m[1]);
  if (codeExt.test(f)) {
    MEDIA_PATH.lastIndex = 0;
    while ((m = MEDIA_PATH.exec(t))) {
      const p = m[1].split('?')[0];
      if (/\/(favicon|icon|apple-touch-icon|og|opengraph|logo)[^/]*$/i.test(p) || allowed(p.replace(/^\//, ''))) continue;
      if (!manifestSrcs.has(p)) add('unmanifested-media', r, lineOf(t, m.index), `${p} has no media.manifest.json entry`);
    }
  }
}

for (const f of publicFiles) {
  const r = rel(f);
  if (allowed(r)) continue;
  const base = path.basename(f).toLowerCase();
  const kb = fs.statSync(f).size / 1024;
  if (base.endsWith('.svg') && !/(logo|icon|favicon|mark|badge-official|flag)/.test(base))
    add('svg-asset', r, 0, 'SVG illustration asset — replace with photo/generated image (logos/icons: name them *logo*/*icon* or allowlist)');
  if (/\.(avif|webp)$/.test(base) && kb > cfg.budgets.imageMaxKB) add('media-budget', r, 0, `${kb.toFixed(0)}KB > ${cfg.budgets.imageMaxKB}KB image budget`);
  if (/\.(png|jpe?g)$/.test(base) && !/(icon|favicon|og|opengraph|apple-touch)/.test(base) && kb > cfg.budgets.legacyRasterMaxKB)
    add('media-budget', r, 0, `${kb.toFixed(0)}KB PNG/JPG — ship AVIF/WebP (budget ${cfg.budgets.legacyRasterMaxKB}KB)`);
  if (/\.(mp4|webm|mov)$/.test(base) && kb > cfg.budgets.videoMaxKB) add('media-budget', r, 0, `${(kb / 1024).toFixed(1)}MB > ${(cfg.budgets.videoMaxKB / 1024).toFixed(1)}MB video budget`);
  if (base.endsWith('.mov')) add('media-budget', r, 0, '.mov — encode to AV1/H.264 MP4 + WebM');
}

// marketing pages
const marketing = srcFiles.filter((f) => /\.(tsx|jsx|mdx)$/.test(f)).filter((f) => {
  const r = rel(f);
  return mktRes.some((re) => re.test(r)) && !cfg.nonMarketing.some((n) => ('/' + r).includes(n));
});
for (const f of marketing) {
  const r = rel(f);
  if (allowed(r)) continue;
  const t = fs.readFileSync(f, 'utf8');
  const hero = /<PremiumHero\b[\s\S]*?\bmedia=|data-pv-hero/.test(t);
  if (!hero) add('hero-missing-media', r, 0, 'marketing page needs <PremiumHero media={...} video={...}> with a real/generated photo or video');
  if (!/<MotionSection\b|data-pv-motion|<PremiumHero\b/.test(t)) add('no-motion', r, 0, 'marketing page needs at least one <MotionSection>');
  else if (!/<MotionSection\b|data-pv-motion/.test(t)) add('no-motion', r, 0, 'add a <MotionSection> below the hero (hero motion alone is not enough)');
}

// report
const byRule = violations.reduce((a, v) => ((a[v.rule] = (a[v.rule] || 0) + 1), a), {});
const summary = { root, mode: reportOnly ? 'report-only' : 'enforce', total: violations.length, byRule, marketingPagesChecked: marketing.length, violations };
if (flag('--json')) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`check-visuals (${summary.mode}) — ${violations.length} violation(s), ${marketing.length} marketing page(s) checked`);
  for (const [k, n] of Object.entries(byRule)) console.log(`  ${k.padEnd(20)} ${n}`);
  for (const v of violations.slice(0, Number(opt('--limit', 400)))) console.log(`${v.rule}\t${v.file}${v.line ? ':' + v.line : ''}\t${v.detail}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(byRule).map(([k, n]) => `| ${k} | ${n} |`).join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### check-visuals (${summary.mode}): ${violations.length} violations\n\n| rule | count |\n|---|---|\n${rows}\n`);
}
process.exit(violations.length && !reportOnly ? 1 : 0);
