/**
 * Mining pilot slice 6: the one owner of who may read and change the staff
 * training register. Guard tests: each fails if the organisation or the
 * technician's self filter is dropped, or if a technician is allowed to write.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  canEditTraining,
  resolveTrainingViewer,
  staffMemberWhere,
  trainingReadWhere,
  trainingWriteWhere,
  viewerFromUserRow,
  type TrainingEditor,
} from "../register-access";

const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("viewerFromUserRow", () => {
  it("owner (ADMIN) and MANAGER are editors of their organisation", () => {
    for (const role of ["ADMIN", "MANAGER"]) {
      const v = viewerFromUserRow("u1", { role, organizationId: "org_a" });
      expect(v).toEqual({ kind: "editor", userId: "u1", organizationId: "org_a", role });
      expect(canEditTraining(v)).toBe(true);
    }
  });

  it("a technician (USER) reads their own only and cannot edit", () => {
    const v = viewerFromUserRow("tech1", { role: "USER", organizationId: "org_a" });
    expect(v).toEqual({ kind: "self", userId: "tech1", organizationId: "org_a" });
    expect(canEditTraining(v)).toBe(false);
  });

  it("no user row, no organisation, or an unknown role reads nothing", () => {
    for (const row of [
      null,
      { role: "ADMIN", organizationId: null },
      { role: "USER", organizationId: null },
      { role: "SOMETHING_ELSE", organizationId: "org_a" },
      { role: null, organizationId: "org_a" },
    ]) {
      const v = viewerFromUserRow("u1", row);
      expect(v.kind).toBe("none");
      expect(trainingReadWhere(v)).toBeNull();
      expect(canEditTraining(v)).toBe(false);
    }
  });
});

describe("trainingReadWhere", () => {
  it("an editor's read is limited to their organisation", () => {
    const v = viewerFromUserRow("m1", { role: "MANAGER", organizationId: "org_a" });
    expect(trainingReadWhere(v)).toEqual({ organizationId: "org_a" });
  });

  it("a technician's read carries both their organisation and their own id", () => {
    const v = viewerFromUserRow("tech1", { role: "USER", organizationId: "org_a" });
    expect(trainingReadWhere(v)).toEqual({
      organizationId: "org_a",
      staffUserId: "tech1",
    });
  });
});

describe("write and staff scope", () => {
  const editor = viewerFromUserRow("o1", {
    role: "ADMIN",
    organizationId: "org_a",
  }) as TrainingEditor;

  it("a write names the record AND the editor's organisation", () => {
    expect(trainingWriteWhere(editor, "rec_9")).toEqual({
      id: "rec_9",
      organizationId: "org_a",
    });
  });

  it("staff an editor may record for are current members of their organisation", () => {
    expect(staffMemberWhere(editor, "tech1")).toEqual({
      id: "tech1",
      organizationId: "org_a",
    });
    expect(staffMemberWhere(editor)).toEqual({ organizationId: "org_a" });
  });
});

describe("resolveTrainingViewer", () => {
  it("re-reads role and organisation from the database by the session user id", async () => {
    findUnique.mockResolvedValue({ role: "USER", organizationId: "org_b" });
    const v = await resolveTrainingViewer("tech2");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "tech2" },
      select: { role: true, organizationId: true },
    });
    expect(v).toEqual({ kind: "self", userId: "tech2", organizationId: "org_b" });
  });

  it("a demoted manager (database now says USER) is no longer an editor", async () => {
    findUnique.mockResolvedValue({ role: "USER", organizationId: "org_a" });
    expect(canEditTraining(await resolveTrainingViewer("was_manager"))).toBe(false);
  });

  it("a deleted user reads nothing", async () => {
    findUnique.mockResolvedValue(null);
    expect((await resolveTrainingViewer("gone")).kind).toBe("none");
  });
});
