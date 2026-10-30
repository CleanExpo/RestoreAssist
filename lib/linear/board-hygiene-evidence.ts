/**
 * RA-7555 — evidence registry for “shipped on main” Linear hygiene.
 *
 * Used by scripts/linear-board-hygiene-report.ts (read-only). Each entry must
 * have at least one check that fails if the fix is reverted.
 */

export type HygieneCheck =
  | { kind: "file"; path: string; note?: string }
  | { kind: "grep"; path: string; pattern: string; note?: string };

export type BoardHygieneEntry = {
  id: string;
  title: string;
  checks: HygieneCheck[];
  /** Vitest path glob or npm script fragment; optional. */
  testHint?: string;
  /** When all checks pass, suggest this Linear state. */
  ifPassSuggest: "Done" | "Todo" | "In Progress";
  ifFailSuggest: "Todo" | "In Progress";
  commentTemplate?: string;
};

export const BOARD_HYGIENE_EVIDENCE: BoardHygieneEntry[] = [
  {
    id: "RA-7754",
    title: "Prelaunch D-021/D-022/D-025/D-030",
    ifPassSuggest: "Done",
    ifFailSuggest: "In Progress",
    testHint: "npm run script:verify-ra-7754",
    commentTemplate:
      "RA-7555 hygiene: all four prelaunch slices verified on main (canLinkRecord, per-owner invoice numbers, invoice row lock, AI-only scope regenerate). See docs/operations/RA-7754-prelaunch-slices.md.",
    checks: [
      { kind: "grep", path: "lib/auth/assert-tenancy.ts", pattern: "export async function canLinkRecord" },
      { kind: "file", path: "prisma/migrations/20260926090000_d022_invoice_number_unique_per_owner/migration.sql" },
      { kind: "file", path: "prisma/migrations/20260926090100_d030_scope_item_source/migration.sql" },
      { kind: "grep", path: "app/api/invoices/[id]/route.ts", pattern: "D-025" },
      { kind: "grep", path: "app/api/inspections/[id]/generate-scope/route.ts", pattern: "ai_generate_scope" },
    ],
  },
  {
    id: "RA-8094",
    title: "Integration Retry → OAuth sync path",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    testHint: "npm run test:unit -- lib/integrations/__tests__/external-sync-client.test.ts app/dashboard/integrations/sync-errors/__tests__/retry-sync.test.tsx",
    commentTemplate:
      "RA-7555 hygiene: Retry on sync-errors + health uses external OAuth sync (not nir-sync without reportId). Tests in external-sync-client + retry-sync specs.",
    checks: [
      { kind: "file", path: "lib/integrations/external-sync-client.ts" },
      { kind: "grep", path: "app/dashboard/integrations/sync-errors/page.tsx", pattern: "runExternalIntegrationSync" },
      { kind: "grep", path: "app/dashboard/integrations/health/page.tsx", pattern: "runExternalIntegrationSync" },
    ],
  },
  {
    id: "RA-7509",
    title: "Portal JWT launch probe (503 vs 401)",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    testHint: "npm run test:unit -- lib/portal/__tests__/client-jwt.test.ts",
    checks: [
      {
        kind: "grep",
        path: "lib/portal/client-jwt.ts",
        pattern: "PORTAL_JWT_SECRET_MISSING",
      },
      { kind: "grep", path: "lib/env-check.ts", pattern: "CLIENT_PORTAL_JWT_SECRET" },
    ],
  },
  {
    id: "RA-7880",
    title: "Guidewire unknown timestamps omitted",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    checks: [
      { kind: "grep", path: "lib/export/guidewire-report-output.ts", pattern: "capturedAt" },
    ],
  },
  {
    id: "RA-7979",
    title: "Pulse signed unsubscribe",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    checks: [
      { kind: "file", path: "lib/pulse/pulse-unsubscribe-token.ts" },
      {
        kind: "grep",
        path: "app/pulse/unsubscribe/page.tsx",
        pattern: "pulseOptOut",
      },
    ],
  },
  {
    id: "RA-7551",
    title: "Portal recovery Playwright proof",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    checks: [
      { kind: "file", path: "e2e/portal-recovery-help.spec.ts" },
    ],
  },
  {
    id: "RA-7862",
    title: "B15 offline queue readback",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    checks: [
      {
        kind: "grep",
        path: "lib/nir-sync-queue.ts",
        pattern: "fetchOfflineReplay",
      },
    ],
  },
  {
    id: "RA-7550",
    title: "SPM report AI draft vs issued copy",
    ifPassSuggest: "Done",
    ifFailSuggest: "Todo",
    testHint:
      "npm run test:unit -- components/__tests__/ReportDetailHonestyPanel.test.tsx && npx playwright test e2e/help/report-honesty.spec.ts -g \"report detail honesty\"",
    commentTemplate:
      "RA-7550 shipped: AI draft vs issued + Upload PDF on /dashboard/reports/new (pre-generate notice) and /dashboard/reports/[id] (ReportDetailHonestyPanel). Covered by report-honesty Playwright + unit tests.",
    checks: [
      {
        kind: "grep",
        path: "components/reports/ReportDetailHonestyPanel.tsx",
        pattern: "AI draft|issued report|Upload PDF",
      },
      {
        kind: "grep",
        path: "app/dashboard/reports/[id]/page.tsx",
        pattern: "ReportDetailHonestyPanel",
      },
      {
        kind: "grep",
        path: "e2e/help/report-honesty.spec.ts",
        pattern: "report-detail-honesty-panel",
      },
    ],
  },
  {
    id: "RA-7555",
    title: "Board hygiene meta (this registry)",
    ifPassSuggest: "In Progress",
    ifFailSuggest: "In Progress",
    testHint: "npm run script:linear-board-hygiene",
    checks: [
      { kind: "file", path: "lib/linear/board-hygiene-evidence.ts" },
      { kind: "file", path: "scripts/linear-board-hygiene-report.ts" },
    ],
  },
];
