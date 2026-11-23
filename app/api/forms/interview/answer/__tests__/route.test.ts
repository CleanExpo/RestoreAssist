/**
 * RA-8594 — POST /api/forms/interview/answer writes a transcript row.
 *
 * The route used to look each question up in the InterviewQuestion table,
 * which nothing fills, and skipped the InterviewResponse write without an
 * error. These tests run the real route against an in-memory store whose
 * InterviewQuestion table is empty (the state of every fresh database), so
 * the lookup cannot be satisfied by a mock that returns a row.
 *
 * No Idempotency-Key header is sent, so withIdempotency passes straight
 * through to the handler.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, any>;

const store: {
  sessions: Row[];
  responses: Row[];
  questions: Row[];
} = { sessions: [], responses: [], questions: [] };

const getServerSession = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: Row }) =>
        where.id === "user_1" ? { id: "user_1" } : null,
    },
    interviewSession: {
      findUnique: async ({ where }: { where: Row }) =>
        store.sessions.find((s) => s.id === where.id) ?? null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const s = store.sessions.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      },
    },
    // Empty on purpose: nothing in the repository fills this table.
    interviewQuestion: {
      findFirst: async ({ where }: { where: Row }) =>
        store.questions.find((q) => matches(q, where)) ?? null,
    },
    interviewResponse: {
      findFirst: async ({ where }: { where: Row }) =>
        store.responses.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }: { where: Row }) =>
        store.responses.filter((r) => matches(r, where)),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `resp_${store.responses.length + 1}`, ...data };
        store.responses.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const r = store.responses.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hits = store.responses.filter((r) => matches(r, where));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.responses.length;
        store.responses = store.responses.filter((r) => !matches(r, where));
        return { count: before - store.responses.length };
      },
    },
  },
}));

import { POST } from "../route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/forms/interview/answer", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  store.questions = [];
  store.responses = [];
  store.sessions = [
    {
      id: "sess_1",
      userId: "user_1",
      answers: null,
      autoPopulatedFields: null,
      totalQuestionsAsked: 5,
      status: "IN_PROGRESS",
    },
  ];
});

describe("POST /api/forms/interview/answer — transcript row (RA-8594)", () => {
  it("writes one InterviewResponse for a code-template question with an empty InterviewQuestion table", async () => {
    const res = await post({
      sessionId: "sess_1",
      questionId: "q1_water_source",
      answer: "clean_water",
    });

    expect(res.status).toBe(200);
    expect(store.responses).toHaveLength(1);
    const row = store.responses[0];
    expect(row.interviewSessionId).toBe("sess_1");
    expect(row.questionId).toBe("q1_water_source");
    expect(row.questionText).toBe("Where did the water come from?");
    expect(row.answerType).toBe("MULTIPLE_CHOICE");
    expect(row.answerValue).toBe("clean_water");
    const body = await res.json();
    expect(body.transcriptRecorded).toBe(true);
  });

  it("keeps one row per question, holding the latest answer", async () => {
    await post({
      sessionId: "sess_1",
      questionId: "q1_water_source",
      answer: "clean_water",
    });
    await post({
      sessionId: "sess_1",
      questionId: "q1_water_source",
      answer: "grey_water",
    });

    const rows = store.responses.filter(
      (r) => r.questionId === "q1_water_source",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].answerValue).toBe("grey_water");
  });

  it("does not report a recorded transcript for a question id outside the library", async () => {
    const res = await post({
      sessionId: "sess_1",
      questionId: "not_a_real_question",
      answer: "x",
    });

    expect(res.status).toBe(200);
    expect(store.responses).toHaveLength(0);
    const body = await res.json();
    expect(body.transcriptRecorded).toBe(false);
    expect(body.message).not.toBe("Answer recorded successfully");
    // The answer itself is still kept on the session.
    expect(JSON.parse(store.sessions[0].answers)).toEqual({
      not_a_real_question: "x",
    });
  });
});
