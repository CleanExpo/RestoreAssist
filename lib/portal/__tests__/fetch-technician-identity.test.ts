import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7727: the client portal's identity card shows the BUSINESS — the profile
// the workspace owner saved — whoever is assigned as technician. Only the
// owner can create a profile, so reading the technician's own profile meant
// the card appeared only on jobs the owner attended personally.
//
// Tenancy: prod runs RLS with zero policies, so this code is the only
// boundary. The profile shown must belong to the workspace that owns the job,
// never another workspace's owner who happens to be linked as technician.

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

import { fetchTechnicianIdentity } from "../fetch-technician-identity";

function serve(fixture = makeTwoWorkspaces()) {
  // Scope-sensitive: dispatch on the id asked for, return only what is selected.
  userFindUnique.mockImplementation(
    async (args: { where: { id: string }; select: Record<string, unknown> }) =>
      project(fixture.userRow(args.where.id), args.select),
  );
}

beforeEach(() => {
  userFindUnique.mockReset();
  serve();
});

describe("fetchTechnicianIdentity — workspace business identity (RA-7727)", () => {
  it("control: the owner attending their own job is shown as themselves", async () => {
    const id = await fetchTechnicianIdentity("owner-a", "Olive", "owner-a");
    expect(id?.name).toBe("Olive Owner");
    expect(id?.photoUrl).toBe("https://img.example/olive.jpg");
    expect(id?.certifications).toHaveLength(1);
  });

  it("shows the owner's business profile when a technician attends", async () => {
    const id = await fetchTechnicianIdentity("tech-a", "Tess Tech", "owner-a");
    expect(id).not.toBeNull();
    expect(id?.name).toBe("Harbour Restorations");
    expect(id?.bio).toMatch(/Harbour Restorations/);
    expect(id?.certifications.map((c) => c.certificationNumber)).toEqual([
      "WRT-1001",
    ]);
  });

  it("resolves the owner when the job was created by the technician", async () => {
    const id = await fetchTechnicianIdentity("tech-a", "Tess Tech", "tech-a");
    expect(id?.name).toBe("Harbour Restorations");
  });

  it("does not put the owner's personal photo under the business name", async () => {
    const id = await fetchTechnicianIdentity("tech-a", "Tess Tech", "owner-a");
    expect(id?.photoUrl).not.toBe("https://img.example/olive.jpg");
  });

  it("never shows another workspace's profile when its owner is linked as technician", async () => {
    const id = await fetchTechnicianIdentity("owner-b", "Rex", "owner-a");
    expect(id?.name).toBe("Harbour Restorations");
    expect(JSON.stringify(id)).not.toMatch(/Rival|Rex|WRT-9999/);
  });

  it("never falls back to another workspace's profile when the owner has none", async () => {
    serve(makeTwoWorkspaces({ profiles: { "owner-a": null } }));
    const id = await fetchTechnicianIdentity("owner-b", "Rex", "owner-a");
    expect(id).toBeNull();
  });

  it("honours the owner's choice not to be shown publicly", async () => {
    serve(
      makeTwoWorkspaces({
        profiles: {
          "owner-a": {
            publicDescription: "hidden",
            isPubliclyVisible: false,
            isVerified: true,
            certifications: [],
          },
        },
      }),
    );
    expect(
      await fetchTechnicianIdentity("tech-a", "Tess Tech", "owner-a"),
    ).toBeNull();
  });

  it("returns null when the job's creator cannot be resolved", async () => {
    expect(await fetchTechnicianIdentity("tech-a", "Tess", "nobody")).toBeNull();
  });
});
