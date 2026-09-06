import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));
const { updateMany, transaction } = h;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => h.transaction(fn),
    user: { findUnique: vi.fn() },
    report: { findUnique: vi.fn(), findFirst: vi.fn() },
    inspection: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: h.updateMany,
    },
  },
}));

import { writeWithinInspectionScope } from "../assert-tenancy";

/**
 * `resolveInspectionWrite` hands the caller a scoped `where`, but a route that
 * then writes a CHILD record keyed on `inspectionId` alone has quietly dropped
 * that scope. An independent review found exactly this across six assessment
 * routes: the child upsert committed on the bare id and the scoped parent
 * update ran afterwards as a separate statement, so the child write landed even
 * when the scope matched nothing.
 *
 * This helper makes the scope re-assertion and the child write one atomic unit:
 * the scoped parent update is the gate, and the child write only happens when
 * that update actually claimed a row.
 */

/** A transaction client that records what the work function was given. */
function fakeTx() {
  return { inspection: { updateMany } };
}

beforeEach(() => {
  updateMany.mockReset();
  transaction.mockReset();
  // Run the callback immediately, as a real interactive transaction would.
  transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(fakeTx()),
  );
});

const SCOPE = { id: "insp_1", OR: [{ userId: "u_1" }] };

describe("writeWithinInspectionScope", () => {
  it("performs the child write when the scope still claims the row", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const work = vi.fn().mockResolvedValue({ id: "child_1" });

    const result = await writeWithinInspectionScope(
      SCOPE,
      { claimType: "HVAC" },
      work,
    );

    expect(result).toEqual({ id: "child_1" });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("refuses the child write when the scope claims nothing", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const work = vi.fn();

    const result = await writeWithinInspectionScope(
      SCOPE,
      { claimType: "HVAC" },
      work,
    );

    expect(result).toBeNull();
    // The whole point: the child must not be touched.
    expect(work).not.toHaveBeenCalled();
  });

  it("gates on the caller's scope, not on a bare id", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await writeWithinInspectionScope(SCOPE, { claimType: "HVAC" }, vi.fn());

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: SCOPE }),
    );
    const passed = updateMany.mock.calls[0][0].where;
    expect(passed).not.toEqual({ id: "insp_1" });
  });

  it("runs the gate and the child write inside one transaction", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const work = vi.fn().mockResolvedValue({ id: "child_1" });

    await writeWithinInspectionScope(SCOPE, { claimType: "HVAC" }, work);

    expect(transaction).toHaveBeenCalledTimes(1);
    // The child write must receive the TRANSACTION client, not the global one,
    // or a later failure cannot roll it back.
    expect(work.mock.calls[0][0]).toHaveProperty("inspection");
  });

  it("checks the scope before doing any child work", async () => {
    const order: string[] = [];
    updateMany.mockImplementation(async () => {
      order.push("gate");
      return { count: 1 };
    });
    const work = vi.fn().mockImplementation(async () => {
      order.push("child");
      return {};
    });

    await writeWithinInspectionScope(SCOPE, { claimType: "HVAC" }, work);

    expect(order).toEqual(["gate", "child"]);
  });
});
