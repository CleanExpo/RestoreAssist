/**
 * RA-8438 — one owner for "what status follows from these signatures".
 *
 * Every current status x (none, some, all signed). CANCELLED and COMPLETED
 * never move; anything earlier moves forward to PARTIALLY_SIGNED or COMPLETED.
 */

import { describe, expect, it, vi } from "vitest";
import {
  AUTHORITY_FORM_STATUSES,
  deriveAuthorityFormStatus,
  settleAuthorityFormStatus,
  type AuthorityFormStatusValue,
} from "../form-status";

const NONE = { total: 2, signed: 0 };
const SOME = { total: 2, signed: 1 };
const ALL = { total: 2, signed: 2 };

const expected: Record<
  AuthorityFormStatusValue,
  [AuthorityFormStatusValue, AuthorityFormStatusValue, AuthorityFormStatusValue]
> = {
  //                    none                  some                 all
  DRAFT: ["DRAFT", "PARTIALLY_SIGNED", "COMPLETED"],
  PENDING_SIGNATURES: ["PENDING_SIGNATURES", "PARTIALLY_SIGNED", "COMPLETED"],
  PARTIALLY_SIGNED: ["PARTIALLY_SIGNED", "PARTIALLY_SIGNED", "COMPLETED"],
  COMPLETED: ["COMPLETED", "COMPLETED", "COMPLETED"],
  CANCELLED: ["CANCELLED", "CANCELLED", "CANCELLED"],
};

describe("deriveAuthorityFormStatus", () => {
  it("covers every status the schema defines", () => {
    expect(Object.keys(expected).sort()).toEqual(
      [...AUTHORITY_FORM_STATUSES].sort(),
    );
  });

  for (const status of AUTHORITY_FORM_STATUSES) {
    const [none, some, all] = expected[status];
    it(`${status}: none -> ${none}, some -> ${some}, all -> ${all}`, () => {
      expect(deriveAuthorityFormStatus(status, NONE)).toBe(none);
      expect(deriveAuthorityFormStatus(status, SOME)).toBe(some);
      expect(deriveAuthorityFormStatus(status, ALL)).toBe(all);
    });
  }

  it("a form with no signatory slots is never COMPLETED", () => {
    expect(
      deriveAuthorityFormStatus("PENDING_SIGNATURES", { total: 0, signed: 0 }),
    ).toBe("PENDING_SIGNATURES");
  });
});

function fakeTx(total: number, unsigned: number) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const count = vi.fn(async (args: { where: { signedAt?: null } }) =>
    "signedAt" in args.where ? unsigned : total,
  );
  return {
    tx: {
      authorityFormSignature: { count },
      authorityFormInstance: { updateMany },
    },
    updateMany,
  };
}

describe("settleAuthorityFormStatus", () => {
  it("partial: conditional write that can only move DRAFT or PENDING_SIGNATURES", async () => {
    const { tx, updateMany } = fakeTx(2, 1);
    const result = await settleAuthorityFormStatus(tx as never, "f1");
    expect(result.allSigned).toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.data).toEqual({ status: "PARTIALLY_SIGNED" });
    expect(arg.where.id).toBe("f1");
    expect([...arg.where.status.in].sort()).toEqual([
      "DRAFT",
      "PENDING_SIGNATURES",
    ]);
    // The racing case: a form already COMPLETED is outside the where clause.
    expect(arg.where.status.in).not.toContain("COMPLETED");
    expect(arg.where.status.in).not.toContain("CANCELLED");
  });

  it("all signed: COMPLETED with completedAt, never from CANCELLED or COMPLETED", async () => {
    const { tx, updateMany } = fakeTx(2, 0);
    const result = await settleAuthorityFormStatus(tx as never, "f1");
    expect(result.allSigned).toBe(true);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.data.status).toBe("COMPLETED");
    expect(arg.data.completedAt).toBeInstanceOf(Date);
    expect([...arg.where.status.in].sort()).toEqual([
      "DRAFT",
      "PARTIALLY_SIGNED",
      "PENDING_SIGNATURES",
    ]);
  });

  it("nothing signed: no write", async () => {
    const { tx, updateMany } = fakeTx(2, 2);
    const result = await settleAuthorityFormStatus(tx as never, "f1");
    expect(result.allSigned).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
