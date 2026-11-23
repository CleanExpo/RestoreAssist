/**
 * Interview transcript helpers (RA-8594).
 *
 * The guided interview's questions live in code
 * (`INTERVIEW_QUESTION_LIBRARY`), not in the `InterviewQuestion` table, which
 * nothing fills. Question text and type for a transcript row therefore come
 * from the code library — the same list the interview screen uses. Do not add
 * a second copy of the questions or a seed that has to be kept in step.
 */

import type { QuestionType as PrismaQuestionType } from "@prisma/client";
import { INTERVIEW_QUESTION_LIBRARY } from "./question-templates";

export interface TranscriptQuestion {
  text: string;
  type: PrismaQuestionType;
}

/** Looks a question id up in the code library; null when it is not there. */
export function findTranscriptQuestion(
  questionId: string | null | undefined,
): TranscriptQuestion | null {
  if (!questionId) return null;
  const q = INTERVIEW_QUESTION_LIBRARY.find((qq) => qq.id === questionId);
  if (!q) return null;
  // The code type ("multiple_choice") and the Prisma enum ("MULTIPLE_CHOICE")
  // name the same eight values; only the case differs.
  return { text: q.text, type: q.type.toUpperCase() as PrismaQuestionType };
}

/** Same serialisation the answer route uses for `answerValue`. */
export function serialiseAnswerValue(answer: unknown): string {
  return typeof answer === "string" ? answer : JSON.stringify(answer);
}

export interface TranscriptRow {
  id: string;
  questionId: string;
  questionText: string;
  answerValue: string | null;
  answerType: PrismaQuestionType;
  answeredAt: Date | null;
  createdAt: Date | null;
  /** "session-answers" when rebuilt from `InterviewSession.answers`. */
  source?: "session-answers";
}

/**
 * Returns the transcript rows for a session, adding any answer held in the
 * session's `answers` JSON that has no `InterviewResponse` row. Interviews
 * answered before RA-8594 have the JSON and no rows; this lets the detail
 * page, the completed summary and resume show them without a data migration.
 */
export function mergeTranscriptWithSessionAnswers(
  rows: TranscriptRow[],
  answersJson: string | null | undefined,
  answeredAt: Date | null = null,
): TranscriptRow[] {
  if (!answersJson) return rows;
  let answers: Record<string, unknown>;
  try {
    const parsed = JSON.parse(answersJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return rows;
    }
    answers = parsed as Record<string, unknown>;
  } catch {
    return rows;
  }

  const have = new Set(rows.map((r) => r.questionId));
  const extra: TranscriptRow[] = [];
  for (const [questionId, answer] of Object.entries(answers)) {
    // "undefined" is the key an answer posted without a questionId lands on.
    if (!questionId || questionId === "undefined" || have.has(questionId)) {
      continue;
    }
    const q = findTranscriptQuestion(questionId);
    extra.push({
      id: `session-answers:${questionId}`,
      questionId,
      questionText: q?.text ?? questionId,
      answerValue: answer == null ? null : serialiseAnswerValue(answer),
      answerType: q?.type ?? "TEXT",
      answeredAt,
      createdAt: answeredAt,
      source: "session-answers",
    });
  }
  return extra.length ? [...rows, ...extra] : rows;
}
