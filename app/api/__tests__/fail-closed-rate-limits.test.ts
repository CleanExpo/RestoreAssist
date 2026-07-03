/**
 * RA-6940 — fail-closed rate limiting on auth + AI-spend routes.
 *
 * lib/rate-limiter.ts defaults to FAIL-OPEN (an in-memory fallback) when the
 * durable store errors. That is the right default for benign read paths, but
 * on authentication surfaces and routes that spend real AI dollars a limiter
 * outage must not disable throttling. Those call sites opt in per-site with
 * failClosedOnUpstashError: true (the fail-closed behaviour itself is
 * unit-tested in lib/__tests__/rate-limiter.test.ts).
 *
 * This is a static regression guard: it fails if any hardened route loses its
 * opt-in flag in a refactor. Each entry lists the limiter prefixes that must
 * carry the flag in that file.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const HARDENED_SITES: Record<string, string[]> = {
  // Auth surfaces (login itself lives inside NextAuth's handler — wrapping it
  // broke OAuth CSRF under RA-1798; lockout via RA-1590 covers it instead).
  "app/api/auth/register/route.ts": ["register"],
  "app/api/auth/forgot-password/route.ts": [
    "forgot-password",
    "forgot-password:email",
  ],
  "app/api/auth/reset-password/route.ts": [
    "reset-password",
    "reset-password:email",
  ],
  "app/api/auth/change-password/route.ts": ["change-password"],
  "app/api/auth/2fa/enable/route.ts": ["2fa-enable"],
  "app/api/auth/2fa/disable/route.ts": ["2fa-disable"],
  "app/api/auth/google-signin/route.ts": ["google-signin"],
  "app/api/auth/google-session/route.ts": ["google-session"],
  // AI-spend surfaces (each burns provider tokens per request).
  "app/api/ai/vision/route.ts": ["ai-vision"],
  "app/api/ai/auto-classify-photo/[photoId]/route.ts": ["auto-classify-photo"],
  "app/api/ai/voice-note-transcribe/route.ts": ["voice-note-transcribe"],
  "app/api/chatbot/route.ts": ["chatbot"],
  "app/api/analytics/narrative/route.ts": ["analytics-narrative"],
  "app/api/claims/analyze-batch/route.ts": ["analyze-batch"],
  "app/api/live-teacher/turn/route.ts": ["live-teacher-turn"],
  "app/api/vision/extract-reading/route.ts": ["vision"],
  "app/api/reports/analyze-technician-report/route.ts": ["analyze-tech"],
  "app/api/reports/generate-cost-estimation/route.ts": ["gen-cost"],
  "app/api/reports/generate-enhanced/route.ts": ["gen-enhanced"],
  "app/api/reports/generate-inspection-report/route.ts": ["gen-inspection"],
  "app/api/reports/generate-question/route.ts": ["gen-question"],
  "app/api/reports/generate-scope-of-works/route.ts": ["gen-scope"],
  "app/api/reports/initial-entry/route.ts": ["report-create"],
  "app/api/reports/[id]/synopsis/route.ts": ["reports-synopsis"],
  "app/api/reports/[id]/client-summary/route.ts": ["reports-client-summary"],
  "app/api/reports/[id]/generate-forensic-pdf/route.ts": ["gen-forensic"],
  "app/api/interviews/[id]/suggest-next/route.ts": ["interview-suggest-next"],
  "app/api/interviews/[id]/validate/route.ts": ["interview-validate"],
  "app/api/inspections/[id]/assessments/[type]/generate/route.ts": [
    "assessments:generate",
  ],
};

const ROOT = resolve(__dirname, "../../..");

/** Extract every applyRateLimit options block from a route source file. */
function limiterBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /applyRateLimit\((?:request|req),\s*\{([^{}]*?)\}\)/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

describe("RA-6940 — auth and AI-spend limiter call sites are fail-closed", () => {
  for (const [file, prefixes] of Object.entries(HARDENED_SITES)) {
    for (const prefix of prefixes) {
      it(`${file} limits "${prefix}" with failClosedOnUpstashError: true`, () => {
        const source = readFileSync(resolve(ROOT, file), "utf8");
        const block = limiterBlocks(source).find((b) =>
          b.includes(`prefix: "${prefix}"`),
        );
        expect(
          block,
          `expected an applyRateLimit call with prefix "${prefix}"`,
        ).toBeDefined();
        expect(block).toContain("failClosedOnUpstashError: true");
      });
    }
  }
});
