/**
 * RA-8594 — transcript helpers. Question text comes from the code library,
 * and interviews with answers only in `InterviewSession.answers` still show
 * them.
 */

import { describe, expect, it } from "vitest";
import {
  findTranscriptQuestion,
  mergeTranscriptWithSessionAnswers,
  type TranscriptRow,
} from "../transcript";
import { INTERVIEW_QUESTION_LIBRARY } from "../question-templates";

describe("findTranscriptQuestion", () => {
  it("returns the library text and the Prisma enum type", () => {
    expect(findTranscriptQuestion("q1_water_source")).toEqual({
      text: "Where did the water come from?",
      type: "MULTIPLE_CHOICE",
    });
  });

  it("maps every library question type to a Prisma QuestionType value", () => {
    const prismaTypes = [
      "YES_NO",
      "MULTIPLE_CHOICE",
      "TEXT",
      "NUMERIC",
      "MEASUREMENT",
      "LOCATION",
      "MULTISELECT",
      "CHECKBOX",
    ];
    for (const q of INTERVIEW_QUESTION_LIBRARY) {
      expect(prismaTypes).toContain(findTranscriptQuestion(q.id)?.type);
    }
  });

  it("returns null for ids outside the library, including AI suggestions", () => {
    expect(findTranscriptQuestion("ai-suggestion-1700000000000")).toBeNull();
    expect(findTranscriptQuestion(undefined)).toBeNull();
  });
});

describe("mergeTranscriptWithSessionAnswers", () => {
  const at = new Date("2026-11-01T00:00:00Z");

  it("rebuilds rows from answers JSON when the session has no rows", () => {
    const rows = mergeTranscriptWithSessionAnswers(
      [],
      JSON.stringify({ q1_water_source: "clean_water", custom_q: [1, 2] }),
      at,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      questionId: "q1_water_source",
      questionText: "Where did the water come from?",
      answerValue: "clean_water",
      answerType: "MULTIPLE_CHOICE",
      source: "session-answers",
    });
    expect(rows[1]).toMatchObject({
      questionId: "custom_q",
      questionText: "custom_q",
      answerValue: "[1,2]",
      answerType: "TEXT",
    });
  });

  it("keeps stored rows and does not duplicate a question they already hold", () => {
    const stored: TranscriptRow = {
      id: "resp_1",
      questionId: "q1_water_source",
      questionText: "Where did the water come from?",
      answerValue: "grey_water",
      answerType: "MULTIPLE_CHOICE",
      answeredAt: at,
      createdAt: at,
    };
    const rows = mergeTranscriptWithSessionAnswers(
      [stored],
      JSON.stringify({ q1_water_source: "clean_water" }),
      at,
    );
    expect(rows).toEqual([stored]);
  });

  it("ignores missing or malformed answers JSON and the 'undefined' key", () => {
    expect(mergeTranscriptWithSessionAnswers([], null)).toEqual([]);
    expect(mergeTranscriptWithSessionAnswers([], "not json")).toEqual([]);
    expect(
      mergeTranscriptWithSessionAnswers([], JSON.stringify({ undefined: "x" })),
    ).toEqual([]);
  });
});
