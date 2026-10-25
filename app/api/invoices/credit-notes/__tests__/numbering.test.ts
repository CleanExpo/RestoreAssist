/**
 * RA-8069: credit-note numbers are per business and per year. Every business
 * starts at CN-{year}-0001; a second note from the same business is -0002;
 * a unique clash on create is retried with a re-read number instead of
 * surfacing as a 409 forever.
 *
 * The mock enforces whichever constraint prisma/schema.prisma declares for
 * CreditNote. With the old platform-wide @unique on creditNoteNumber,
 * business B's first note collided with business A's and every retry
 * collided again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";

const { session } = vi.hoisted(() => ({
  session: { user: { id: "user_a" } },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => session),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: NextRequest,
    _userId: string,
    handler: (raw: string) => Promise<Response>,
  ) => handler(await req.text()),
}));

type Row = { userId: string; creditNoteNumber: string };

const { rows, creditNote } = vi.hoisted(() => {
  const rows: Row[] = [];
  const state = { globalUnique: false };
  const p2002 = () =>
    Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["userId", "creditNoteNumber"] },
    });
  const creditNote = {
    // Keep a count mock so the old count-based numbering still runs (and
    // fails the cross-business case) when this test is run against it.
    count: vi.fn(async ({ where }: { where: { userId: string } }) =>
      rows.filter((r) => r.userId === where.userId).length,
    ),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { userId: string; creditNoteNumber: { startsWith: string } };
      }) => {
        const mine = rows
          .filter(
            (r) =>
              r.userId === where.userId &&
              r.creditNoteNumber.startsWith(where.creditNoteNumber.startsWith),
          )
          .sort((a, b) => b.creditNoteNumber.localeCompare(a.creditNoteNumber));
        return mine[0] ? { creditNoteNumber: mine[0].creditNoteNumber } : null;
      },
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      if (
        rows.some(
          (r) =>
            (state.globalUnique || r.userId === data.userId) &&
            r.creditNoteNumber === data.creditNoteNumber,
        )
      ) {
        throw p2002();
      }
      rows.push({ userId: data.userId, creditNoteNumber: data.creditNoteNumber });
      return { id: `cn_${rows.length}`, ...data };
    }),
  };
  return { rows, creditNote: Object.assign(creditNote, { state }) };
});

const creditNoteModel =
  readFileSync(
    path.resolve(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  ).match(/model CreditNote \{[\s\S]*?\n\}/)?.[0] ?? "";
creditNote.state.globalUnique = /creditNoteNumber\s+String\s+@unique/.test(
  creditNoteModel,
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        currency: "AUD",
      })),
    },
    creditNote,
  },
}));

import { POST } from "../route";

const year = new Date().getFullYear();

async function issue(userId: string) {
  session.user.id = userId;
  const res = await POST(
    new NextRequest("http://localhost/api/invoices/credit-notes", {
      method: "POST",
      body: JSON.stringify({
        invoiceId: `inv_${userId}`,
        reason: "PRICING_ERROR",
        lineItems: [{ description: "Labour", quantity: 1, unitPrice: 1000 }],
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  const body = await res.json();
  return { status: res.status, number: body.creditNote?.creditNoteNumber };
}

describe("POST /api/invoices/credit-notes: numbering (RA-8069)", () => {
  beforeEach(() => {
    rows.length = 0;
    vi.clearAllMocks();
  });

  it("reads the CreditNote model from the schema", () => {
    expect(creditNoteModel).toContain("creditNoteNumber");
  });

  it("gives two different businesses each their own CN-<year>-0001", async () => {
    expect(await issue("user_a")).toEqual({
      status: 201,
      number: `CN-${year}-0001`,
    });
    expect(await issue("user_b")).toEqual({
      status: 201,
      number: `CN-${year}-0001`,
    });
  });

  it("numbers a business's second credit note -0002", async () => {
    await issue("user_a");
    expect(await issue("user_a")).toEqual({
      status: 201,
      number: `CN-${year}-0002`,
    });
  });

  it("restarts at 0001 in a new year rather than counting earlier years", async () => {
    rows.push({ userId: "user_a", creditNoteNumber: `CN-${year - 1}-0007` });
    expect(await issue("user_a")).toEqual({
      status: 201,
      number: `CN-${year}-0001`,
    });
  });

  it("retries a unique clash on the first attempt and succeeds", async () => {
    creditNote.create.mockImplementationOnce(async () => {
      // A concurrent request took -0001 between our read and our insert.
      rows.push({ userId: "user_a", creditNoteNumber: `CN-${year}-0001` });
      throw new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" },
      );
    });
    expect(await issue("user_a")).toEqual({
      status: 201,
      number: `CN-${year}-0002`,
    });
    expect(creditNote.create).toHaveBeenCalledTimes(2);
  });
});
