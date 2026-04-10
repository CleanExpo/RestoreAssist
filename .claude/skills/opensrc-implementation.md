---
name: opensrc-implementation
description: Use when adding a new npm package or GitHub repo to the project and you want AI agents to have deep implementation context for it, not just TypeScript types. Also use when implementing features that depend on library internals.
---

# opensrc — Fetch Package Source for AI Context

## What it is

`opensrc` (vercel-labs/opensrc) is a CLI that downloads the actual source code of npm packages and GitHub repos into an `opensrc/` directory in your project. This gives AI coding agents implementation-level understanding — not just types and docs.

**When this matters for RestoreAssist:**

- Working with Sharp image processing (compression pipeline, format options)
- Supabase Storage client internals (bucket operations, signed URLs)
- Prisma client edge cases (query builder, transaction behaviour)
- Any library where the type definitions are insufficient to understand actual behaviour

## Install

```bash
npx opensrc@latest
# or globally
npm install -g opensrc
```

## Core commands

```bash
# Fetch npm package source (auto-detects version from lockfile)
npx opensrc fetch sharp
npx opensrc fetch @supabase/supabase-js
npx opensrc fetch prisma

# Fetch GitHub repo directly
npx opensrc fetch github:vercel-labs/opensrc

# Fetch multiple at once
npx opensrc fetch sharp @supabase/supabase-js prisma

# List what's been fetched
npx opensrc list

# Remove a source
npx opensrc remove sharp

# Update all to current installed versions
npx opensrc update
```

## What it does

1. Detects installed version from `pnpm-lock.yaml` / `package-lock.json`
2. Downloads source from npm registry (or GitHub)
3. Places it in `opensrc/<package-name>/`
4. Optionally updates `.gitignore`, `tsconfig.json`, `AGENTS.md`/`CLAUDE.md`

## RestoreAssist setup

### .gitignore entry (add this)

```
# opensrc — AI agent source context
opensrc/
```

### High-value packages to fetch for this project

```bash
npx opensrc fetch sharp                    # Image compression internals
npx opensrc fetch @supabase/supabase-js    # Storage/auth client
npx opensrc fetch @supabase/storage-js     # Storage-specific client
npx opensrc fetch next-auth                # Auth session internals
npx opensrc fetch @prisma/client           # ORM query builder
npx opensrc fetch zod                      # Validation schema behaviour
```

### After fetching, reference in CLAUDE.md or tell Claude:

> "Source for sharp is available at opensrc/sharp/ — use it for implementation details"

## Key workflow

```
Before implementing a feature that uses library internals:
1. Run: npx opensrc fetch <package>
2. Tell Claude: "sharp source is in opensrc/sharp/"
3. Claude reads actual implementation to understand exact API behaviour
4. Implement with confidence — no guessing about undocumented options
```

## Caveats

- `opensrc/` can be large — always gitignore it
- Run `npx opensrc update` after `pnpm install` to keep versions in sync
- Not all packages publish full source to npm — some only publish dist; opensrc handles this gracefully
- For monorepos, run from the workspace root

## Value for RestoreAssist

The compression pipeline (`lib/storage/compression.ts`) uses Sharp with dynamic imports. Having `opensrc/sharp/` available would have made it trivial to confirm the exact `sharp().jpeg({ quality: 80 }).resize(2048, 2048, { fit: 'inside' })` API without trial-and-error. Strongly recommended before any future Sharp or Supabase Storage work.
