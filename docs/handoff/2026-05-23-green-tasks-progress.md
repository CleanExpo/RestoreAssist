# RestoreAssist Green Tasks Progress — 2026-05-23

Operator: Hermes / Unite-Group Nexus Hub

## Current green status

- `pnpm type-check`: PASS
- Local root route `http://localhost:3000/`: PASS, HTTP 200
- `pnpm dev`: running under Hermes process `proc_c05e3cffd8fc`

## Runtime 500 root cause and fix

Issue: root route previously returned HTTP 500 with `TypeError: Invalid URL`.

Evidence traced to NextAuth client module evaluation during SSR:

- stack: `next-auth/utils/parse-url.js`
- failing path: `parseUrl(process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL)`
- local `.env.local` had no usable `NEXTAUTH_URL`, while `VERCEL_URL` was present but empty, causing NextAuth to parse an invalid URL at SSR module evaluation.

Local environment repair applied:

- added `NEXTAUTH_URL="http://localhost:3000"`
- commented out empty local `VERCEL_URL`

Verification:

- restarted `pnpm dev`
- `GET http://localhost:3000/` returned HTTP 200
- `pnpm type-check` passed after repair

## Lint status

`pnpm lint` still fails, but reduced warning count after safe auto-fix:

- Before: 966 problems, 154 errors, 812 warnings
- Current: 906 problems, 152 errors, 754 warnings

Remaining error groups:

- 38 `preserve-caught-error`
- 35 `no-useless-escape`
- 34 `no-useless-assignment`
- 12 `react-hooks/rules-of-hooks`
- 7 `@next/next/no-img-element` unknown-rule disable comments
- 6 `no-control-regex`
- 6 `no-empty`
- 4 `no-redeclare`
- 3 `no-constant-binary-expression`
- 2 `no-prototype-builtins`
- 1 each: `no-async-promise-executor`, `no-unreachable`, `no-case-declarations`, `no-restricted-globals`, `no-irregular-whitespace`

## Engineering note

A first engineer lane was dispatched for safe lint cleanup, but timed out after 10 minutes. Its only confirmed durable improvement was two lint errors removed in `app/api/inspections/[id]/generate-scope/route.ts`; type-check remains green.

## Recommended next sequence

1. Fix the 7 unknown `@next/next/no-img-element` rule-disable comments carefully by editing only those exact comments or by configuring a compatible Next plugin rule. Avoid fuzzy bulk patching on JSX.
2. Fix `no-useless-escape` and `no-control-regex` in small file batches with targeted eslint per file.
3. Fix `no-empty` and one-off simple rules.
4. Leave `react-hooks/rules-of-hooks` and `preserve-caught-error` to focused engineer lanes because they require behavioural review.

Do not treat full lint as a one-shot PR. Keep batches small and verify with `pnpm type-check` after each batch.
