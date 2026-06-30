/**
 * SP-A Task 5 — Close-summary AI lifecycle hook.
 *
 * Drafts a short client-facing summary of a closed inspection. Routed
 * through `runLifecycleHook` so the §5.2 invariants (subscription gate,
 * atomic credit deduction, BYOK fallback, AuditLog) are honoured uniformly.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 5.
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §5.3.
 */
import { prisma } from "@/lib/prisma";
import { routeAiRequest } from "@/lib/ai/model-router";
import { runLifecycleHook, type LifecycleHookResult } from "./_shared";

export interface BuildCloseSummaryArgs {
  inspectionId: string;
  /** Optional — close still works for inspections without an attached invoice (e.g. no-charge jobs). */
  invoiceId?: string | null;
  userId: string;
  orgId: string | null;
}

export interface CloseSummaryDraft {
  /** The summary text — editable by the user before the actual close. */
  text: string;
  /** The inspection number echoed for the UI to render in the card title. */
  inspectionNumber: string;
}

interface BuildInput {
  inspection: {
    id: string;
    inspectionNumber: string;
    propertyAddress: string;
    signedAt: Date | null;
    claimType: string | null;
  };
  invoiceCents: { totalIncGST: number; gstAmount: number } | null;
}

export async function buildCloseSummary(
  args: BuildCloseSummaryArgs,
): Promise<LifecycleHookResult<CloseSummaryDraft>> {
  // Hydrate the data the AI prompt + fallback both need. Single query,
  // explicit select per CLAUDE.md rule 4.
  const inspection = await prisma.inspection.findUnique({
    where: { id: args.inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      signedAt: true,
      claimType: true,
    },
  });
  if (!inspection) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Inspection not found",
    };
  }

  let invoiceCents: BuildInput["invoiceCents"] = null;
  if (args.invoiceId) {
    const inv = await prisma.invoice.findUnique({
      where: { id: args.invoiceId },
      select: { totalIncGST: true, gstAmount: true },
    });
    if (inv) invoiceCents = inv;
  }

  const input: BuildInput = { inspection, invoiceCents };

  return runLifecycleHook<BuildInput, CloseSummaryDraft>({
    feature: "close_summary",
    userId: args.userId,
    orgId: args.orgId,
    inspectionId: args.inspectionId,
    input,
    build: async ({ input: i }) => {
      const prompt = buildPrompt(i);
      const ai = await routeAiRequest(
        {
          taskType: "close_summary",
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: prompt,
          maxTokens: 400,
          temperature: 0.3,
        },
        // Minimal RouterConfig — close_summary is "basic" tier so RestoreAssist AI
        // handles it; BYOK fields are placeholders, never consulted for basic.
        {
          byokModel: "claude-sonnet-4-6",
          byokApiKey: "",
        },
      );
      const guarded = applyCitationGuard(ai.text, i.inspection.claimType);
      return {
        text: guarded.trim(),
        inspectionNumber: i.inspection.inspectionNumber,
      };
    },
    fallback: (i) => ({
      text: fallbackTemplate(i),
      inspectionNumber: i.inspection.inspectionNumber,
    }),
  });
}

// ─── Prompt + fallback template ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are RestoreAssist's close-summary assistant.
Draft a concise, client-facing summary (max 200 words) for a completed water
damage / restoration inspection in Australia. Be warm but professional.
Cite IICRC S500:2021 §X.Y where relevant. Include: scope completed, total
billed (GST 10%), warranty period. No internal jargon.`;

function buildPrompt(i: BuildInput): string {
  const signedAt = i.inspection.signedAt
    ? i.inspection.signedAt.toISOString().slice(0, 10)
    : "the inspection date";
  const total = i.invoiceCents
    ? formatAud(i.invoiceCents.totalIncGST)
    : "the agreed amount";
  const claim = (i.inspection.claimType ?? "restoration").toLowerCase();
  return [
    `Inspection number: ${i.inspection.inspectionNumber}`,
    `Property: ${i.inspection.propertyAddress}`,
    `Completed: ${signedAt}`,
    `Claim type: ${claim}`,
    `Total billed (inc GST): ${total}`,
    `Warranty: 90 days workmanship`,
    "",
    `Draft the close summary the customer will receive.`,
  ].join("\n");
}

function fallbackTemplate(i: BuildInput): string {
  const signedAt = i.inspection.signedAt
    ? i.inspection.signedAt.toISOString().slice(0, 10)
    : "[completion date pending]";
  const total = i.invoiceCents
    ? formatAud(i.invoiceCents.totalIncGST)
    : "[total pending]";
  return [
    `Inspection ${i.inspection.inspectionNumber} at ${i.inspection.propertyAddress} was completed on ${signedAt}.`,
    `Total billed (inc GST 10%): ${total}.`,
    `Workmanship is covered by a 90-day warranty from the completion date.`,
    `This water damage restoration was carried out with reference to IICRC S500:2021 (Standard for Professional Water Damage Restoration).`,
    `Please review and edit this summary before sending to the customer.`,
  ].join("\n\n");
}

function applyCitationGuard(text: string, claimType: string | null): string {
  // Rule 14: every IICRC reference cites edition + year. If the draft is for a
  // water claim and doesn't mention S500:, append a neutral citation of the
  // governing standard. Do NOT assert that work was "completed in accordance
  // with" the standard — that is an unverified compliance claim and must come
  // from recorded evidence, not an auto-injected stock line.
  if (text.includes("S500:")) return text;
  if (!claimType) return text;
  const ct = claimType.toUpperCase();
  if (ct !== "WATER") return text;
  return (
    text.trimEnd() +
    "\n\nApplicable standard: IICRC S500:2021 (Standard for Professional Water Damage Restoration)."
  );
}

function formatAud(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(dollars);
}
