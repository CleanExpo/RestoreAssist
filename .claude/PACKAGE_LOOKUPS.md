# Package Lookups — opensrc patterns for RA dependencies

When you need to read a dependency's internals (not just its types/interface), use [opensrc](../docs/tooling/vendor-opensrc/README.md). It fetches package source from npm / PyPI / crates.io / GitHub and caches at `~/.opensrc/`. CLAUDE.md rule: don't fabricate APIs — read the source.

## One-time setup

```bash
npm install -g opensrc
opensrc --version   # confirm 0.6+
```

Yes, `npm` — opensrc is a global CLI tool. The pnpm-only rule applies to RA's `package.json` deps, not global development tools.

## Pre-warm cache for RA's core deps

```bash
# Run once after install — populates ~/.opensrc/ for the packages we hit most
opensrc fetch \
  next prisma @prisma/client \
  next-auth @auth/prisma-adapter \
  @anthropic-ai/sdk @ai-sdk/anthropic @ai-sdk/react \
  @google/genai @google/generative-ai \
  zod @hookform/resolvers react-hook-form \
  @capacitor/core @capacitor/ios @capacitor/android \
  stripe \
  @supabase/supabase-js
```

## Common patterns

### Finding how Next.js App Router resolves a route
```bash
rg "createPagesMapping|appPaths" $(opensrc path next)/packages/next/src/build
```

### Reading Prisma's emit logic for a specific model type
```bash
rg "createGenerator|JSDocType" $(opensrc path prisma)/packages/client/src/generation
```

### Auditing the AI SDK transport layer (streaming, retries)
```bash
rg "fetch|stream" $(opensrc path @ai-sdk/anthropic)/src
```

### Verifying a Radix primitive's accessibility shape before wrapping it
```bash
cat $(opensrc path @radix-ui/react-dialog)/src/Dialog.tsx
```

### Cross-package search for a pattern
```bash
rg "createServerClient" $(opensrc path @supabase/supabase-js @supabase/ssr)
```

### Specific version (when our lockfile pins X but you need to compare with Y)
```bash
cat $(opensrc path zod@3.22.0)/src/types.ts
```

## When NOT to use opensrc

- For RA's own code → read directly with `Read` or `rg`.
- For framework documentation → use `claude.ai Context7` MCP (gives current docs, not source).
- For typing/interface questions → TypeScript inference + `pnpm type-check` is faster than reading source.

Use opensrc when you need to know *how* a package does something internally — its actual implementation, not its docs.

## Vendored CLI source

`docs/tooling/vendor-opensrc/` contains the full CLI source (Rust + npm shim) for reference. Useful when:
- The CLI behaviour is surprising and you want to read what it does.
- You're contributing a fix back upstream.
- You need to build a local patch (`cargo build --manifest-path docs/tooling/vendor-opensrc/packages/opensrc/cli/Cargo.toml`).

Don't modify `docs/tooling/vendor-opensrc/` for RA-specific changes — track upstream via the README link.
