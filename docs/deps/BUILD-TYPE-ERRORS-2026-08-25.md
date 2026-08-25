---
type: concept
name: BUILD-TYPE-ERRORS-2026-08-25
description: The production build reports success while carrying TypeScript errors — the backlog that has to clear before ignoreBuildErrors can be turned off
okf_version: "0.1"
updated: 2026-08-25
---

# The production build cannot go red — 2026-08-25

`next.config.mjs` line 33 sets `typescript.ignoreBuildErrors: true`. Every
production build therefore reports **success** while carrying TypeScript errors.
This is a green signal that is structurally incapable of turning red, which is
the defect class that cost this project a full day on 2026-08-24: `main` was
merged, believed deployed, and the build "passed" throughout.

Do **not** flip the flag to `false` yet. Measured below: doing so takes the build
from exit 0 to exit 1 immediately.

## The flag is what hides them — measured, not assumed

Same commit, same tree, same command. Only the flag differs.

| `typescript.ignoreBuildErrors` | `npm run build` |
| --- | --- |
| `true` (as shipped) | **exit 0** — reports "Compiled successfully in 92s" |
| `false` | **exit 1** — names the errors and stops |

The build is not passing because the code is clean. It is passing because it was
told not to look.

## How many errors there are

Three numbers, because the count depends on which package manager resolved the
tree — and production uses the one with the highest count.

| Toolchain | Where it runs | Errors |
| --- | --- | --- |
| npm, `main` as of `6c4f0730` | **DigitalOcean App Platform — production** | **9** |
| npm, with PR #2034's override | production, once #2034 merges | **2** |
| pnpm, `--frozen-lockfile` | CI "Quality Checks", local dev | **0** |

The pnpm zero is why this went unnoticed for so long: every check a developer
runs locally, and every check CI runs, uses pnpm. The only toolchain that sees
the 9 is the one nobody watches, on the box that serves customers.

## The 9 errors on current main

Captured with `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` against a
clean `npm ci` on `6c4f0730`. Exit code 2.

### Cluster A — duplicate `google-auth-library` (7 errors)

```text
lib/cloud-mirror/drive.ts(39,3)    TS2322  OAuth2Client not assignable to OAuth2Client
lib/cloud-mirror/drive.ts(127,47)  TS2769  No overload matches this call
lib/cloud-mirror/drive.ts(160,47)  TS2769  No overload matches this call
lib/cloud-mirror/drive.ts(193,49)  TS2769  No overload matches this call
lib/cloud-mirror/drive.ts(200,49)  TS2769  No overload matches this call
lib/cloud-mirror/drive.ts(202,24)  TS2339  Property 'storageQuota' does not exist on Schema$About
lib/google-drive.ts(41,40)         TS2769  No overload matches this call
```

Root cause: `googleapis-common@8.0.3` pulled `google-auth-library@10.5.0` while
the root held `10.9.1`. Two v10 copies whose `OAuth2Client` types cannot unify
across separate declarations of a private property.

**Fixed by PR #2034** — mirrors the existing `pnpm.overrides` pin into npm's own
`overrides` field. Proven load-bearing by a three-state control: removing the
override brings `10.5.0` and all 7 errors back.

### Cluster B — `PluginConfig` (2 errors)

```text
components/ai-elements/message.tsx(330,7)    TS2322  PluginConfig
components/ai-elements/reasoning.tsx(219,19) TS2322  PluginConfig
```

Both: `{ cjk: CjkPlugin; code: CodeHighlighterPlugin; math: MathPlugin; mermaid:
DiagramPlugin; }` is not assignable to `PluginConfig`.

**Cause not established.** These appear under npm and not under pnpm, so
something in the resolved tree differs. One hypothesis was tested and failed:
mirroring `@streamdown/code>shiki` (present in `pnpm.overrides`, absent from
npm's) into npm left the count at 2. That pin was reverted rather than shipped on
an untested story. Whoever picks this up starts from an open question, not a
half-answer.

## Proposed order

1. **Merge PR #2034.** Clears cluster A. Production goes 9 → 2. Already proven.
2. **Diagnose cluster B.** Compare the npm and pnpm resolutions of `streamdown`,
   `@streamdown/code` and their `shiki` dependency on clean single-toolchain
   trees — the earlier attempt was measured on a tree contaminated by alternating
   `npm install` and `pnpm install`, which is why it proved nothing.
3. **Flip `ignoreBuildErrors` to `false`** once `npx tsc --noEmit` exits 0 on a
   clean `npm ci`. Verify by pushing a deliberate type error and confirming the
   build fails. A gate that has never been seen to fail is not a gate.
4. **Then decide the lockfile question.** See below — it is the reason this class
   of bug exists at all.

## The larger problem underneath

`package.json` carries **38** pins in `pnpm.overrides` and, before PR #2034, **0**
in npm's `overrides`. Production installs with npm. So none of those 38 applied
in production.

That list is not cosmetic. It includes security pins: `dompurify`, `loader-utils`,
`tar`, `ws`, `qs`, `nodemailer`, `esbuild`, `vite`, `postcss`, `minimatch`,
`brace-expansion`, `form-data`, `protobufjs`, `nanoid`, `pdfjs-dist`.

**NOT CHECKED:** whether each of those 37 remaining pins resolves to a vulnerable
version under npm. Verifying that is a separate piece of work and should not be
assumed either way from this document.

The durable fix is one lockfile. While the repo carries both `package-lock.json`
and `pnpm-lock.yaml`, every override has to be written twice, and forgetting the
second copy is silent — exactly what happened here.

## What was not checked

- Whether the 2 remaining errors affect runtime behaviour, or are type-level only
- Whether the 37 other pins resolve to vulnerable versions under npm
- Any production deploy
