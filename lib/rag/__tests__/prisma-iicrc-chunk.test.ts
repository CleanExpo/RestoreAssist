import { describe, it, expect } from "vitest";

describe("IicrcChunk model availability", () => {
  it("prisma client exposes iicrcChunk CRUD methods", async () => {
    const { prisma } = await import("@/lib/prisma");
    // If the migration has NOT run, prisma.iicrcChunk is undefined and this throws.
    expect(typeof prisma.iicrcChunk.findMany).toBe("function");
    expect(typeof prisma.iicrcChunk.create).toBe("function");
    expect(typeof prisma.iicrcChunk.upsert).toBe("function");
  });
});
