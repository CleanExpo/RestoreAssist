/**
 * Shapes of the replies the fire walkthrough screen relies on.
 *
 * Kind K15 (rounds 15 and 16): the browser trusted a reply because it was a
 * 2xx. A reply now counts only after it passes one of these schemas in full;
 * anything else is treated as unconfirmed, so a save keeps its retry key and
 * the screen never reads a field that is not there. Each schema is checked
 * against its TypeScript type, so the two cannot drift apart.
 */

import { z } from "zod";
import type {
  CaptureOutcome,
  FireActionResponse,
  FireBlockerBody,
  FireWalkthroughResponse,
  WalkthroughStatus,
} from "./schema";

const sectionStatusSchema = z.object({
  sectionId: z.string(),
  state: z.enum(["todo", "filled", "na"]),
  entryCount: z.number(),
  notes: z.array(z.string()),
  naReason: z.string().optional(),
});

const walkthroughStatusSchema: z.ZodType<WalkthroughStatus> = z.object({
  started: z.boolean(),
  noticeAcknowledged: z.boolean(),
  sections: z.array(sectionStatusSchema),
  openSectionIds: z.array(z.string()),
  canSignOff: z.boolean(),
  reviewRevision: z.string(),
  signoff: z.object({
    state: z.enum(["unsigned", "signed", "changed"]),
    signedAt: z.string().optional(),
    typedName: z.string().optional(),
  }),
});

const outcomeSchema: z.ZodType<CaptureOutcome> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("filed"), sectionId: z.string(), say: z.string() }),
  z.object({ kind: z.literal("ask"), candidateSectionId: z.string(), say: z.string() }),
  z.object({ kind: z.literal("marked_na"), sectionId: z.string(), say: z.string() }),
  z.object({ kind: z.literal("confirm_na"), sectionId: z.string(), reason: z.string(), say: z.string() }),
]);

const walkthroughFields = {
  applicable: z.boolean(),
  status: walkthroughStatusSchema,
  nextPrompt: z.string(),
  nextSectionId: z.string().nullable(),
};

export const fireWalkthroughReplySchema: z.ZodType<FireWalkthroughResponse> = z.object(walkthroughFields);

export const fireActionReplySchema: z.ZodType<FireActionResponse> = z.object({
  ...walkthroughFields,
  outcome: outcomeSchema.optional(),
});

export const voiceSessionReplySchema = z.object({
  session: z.object({ sessionId: z.string().min(1) }),
});

/** What the screen may show and act on from a final refusal. */
export interface FireRefusal {
  message: string;
  body?: FireBlockerBody;
}

const blockerBodySchema: z.ZodType<FireBlockerBody> = z.object({
  error: z.string().min(1),
  code: z.enum(["NOTICE_REQUIRED", "SECTIONS_OPEN", "CHANGED_AFTER_SIGNOFF", "REVIEW_STALE", "INSPECTION_SUBMITTED"]),
  openSectionIds: z.array(z.string()),
});

/**
 * Round 17, kind K15: a refusal body is checked like any other reply. Three
 * shapes are known: the fire route's blocker (422), its plain refusal
 * ({ error: string }), and the shared apiError ({ error: { message } }) used
 * for 400/401/403/404. Each resolves to a plain string message. Anything else
 * fails the check, and the caller treats it as unconfirmed.
 */
export const fireRefusalSchema: z.ZodType<FireRefusal> = z.union([
  blockerBodySchema.transform((body) => ({ message: body.error, body })),
  // Strict: a blocker with an unknown code must not pass as a plain refusal.
  z.strictObject({ error: z.string().min(1) }).transform((b) => ({ message: b.error })),
  z.object({ error: z.object({ message: z.string().min(1) }) }).transform((b) => ({ message: b.error.message })),
]);
