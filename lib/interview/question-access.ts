/**
 * The one owner of "which guided-interview questions can this user get" (RA-8458).
 *
 * RA-6929 retired the STANDARD / PREMIUM / ENTERPRISE catalog and left
 * `User.interviewTier` inert, so the answer is every question for every user.
 * The engine and `getQuestionsForSubscriptionTier` call this; nothing else may
 * compare `minTierLevel` against a user tier. If questions are ever tied to a
 * paid add-on (RA-6922), change this function, not its callers.
 */
import type { Question, SubscriptionTier } from "./types";

export function isInterviewQuestionAvailable(
  _question: Pick<Question, "id" | "minTierLevel">,
  _userTier?: SubscriptionTier | string | null,
): boolean {
  return true;
}
