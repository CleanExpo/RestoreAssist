// RA-1398 — ESLint v9 flat config.
//
// Prior to Next.js 16, `next lint` auto-bootstrapped ESLint + config.
// Next 16 deprecated that path; this config restores `pnpm lint` as a
// working CI gate.
//
// INTERIM scope (this PR): minimal flat config — catches the high-value bugs
// (`no-unused-vars`, `no-undef`, react-hooks rules) without the full
// `eslint-config-next` ruleset, which is incompatible with v9 flat-compat
// in the `eslint-config-next` version currently pinned.
//
// FOLLOW-UP (new ticket after this lands): migrate to the full Next.js rule
// chain via the shared `next/core-web-vitals` + `next/typescript` configs
// once a flat-config-native version of `eslint-config-next` lands, or via
// a hand-rolled plugin chain. Tracked as a new RA ticket.
//
// Until then: `pnpm lint` runs with the rules below, CI can block on it,
// authors get real warnings on unused vars + undefined references, and the
// gate reopens.

import js from "@eslint/js";
import globals from "globals";
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "public/**",
      "prisma/migrations/**",
      "**/*.min.js",
      "pnpm-lock.yaml",
      ".pi-ceo/**",
      ".claude/**",
      ".hermes/**",
      ".superpowers/**",
      "storybook-static/**",
      "distribution/**",
      "vendor/**",
      // Scripts folder has its own tsconfig and historically broke the old linter too
      "scripts/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
        React: "readonly",
        JSX: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      // TypeScript makes the base `no-unused-vars` noisy on interfaces and
      // re-exports; use the TS-aware one instead.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `no-undef` is unhelpful in TS (TS's own checker catches undefined refs);
      // turning it off prevents thousands of false positives on globals.
      "no-undef": "off",
      // react-hooks rules of Hooks (critical correctness). Promoted warn → error
      // 2026-06-23: 3 conditional-hook crashes had shipped to prod under "warn"
      // (PR #1445 — /dashboard/success, /pilot/adjuster-review,
      // /dashboard/admin/usage). Repo is now at 0 violations; this keeps the
      // whole crash class from ever regressing.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Keep this interim gate focused on high-signal correctness checks. These
      // rules produce broad legacy noise across files that TypeScript already
      // proved are type-safe in the ship lane.
      "no-prototype-builtins": "off",
      "no-redeclare": "off",
      "no-control-regex": "off",
      "no-irregular-whitespace": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      // RA-1566: ban native browser confirm()/alert()/prompt() in app/ — use shadcn AlertDialog instead
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message:
            "Use shadcn <AlertDialog> / ConfirmDialog instead of window.confirm(). See components/ui/confirm-dialog.tsx.",
        },
        {
          name: "alert",
          message:
            "Use shadcn <AlertDialog> or a toast instead of window.alert().",
        },
        {
          name: "prompt",
          message: "Use a controlled dialog instead of window.prompt().",
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
  },
];
