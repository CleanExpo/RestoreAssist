import { describe, it, expect } from "vitest";

describe("IicrcChunk model availability", () => {
  it("prisma client exposes iicrcChunk CRUD methods", async () => {
    const { prisma } = await import("@/lib/prisma");
    expect(typeof prisma.iicrcChunk.findMany).toBe("function");
    expect(typeof prisma.iicrcChunk.create).toBe("function");
    expect(typeof prisma.iicrcChunk.upsert).toBe("function");
  });
});
