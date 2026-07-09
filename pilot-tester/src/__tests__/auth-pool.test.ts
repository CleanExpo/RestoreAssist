/**
 * RA-7008 — identity containment on the shared database.
 *
 * With no separate sandbox DB (founder decision 2026-07-09), the harness's
 * safety boundary is WHO it can authenticate as. loadUserPool must refuse any
 * pool containing a non-synthetic identity, so the swarm can never hold a
 * real user's credentials.
 */

import { describe, expect, it, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadUserPool } from "../client/auth.js";

const tmpFiles: string[] = [];

async function poolFile(entries: unknown): Promise<string> {
  const p = path.join(
    os.tmpdir(),
    `pilot-pool-${Math.random().toString(36).slice(2)}.json`,
  );
  await fs.writeFile(p, JSON.stringify(entries));
  tmpFiles.push(p);
  return p;
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((p) => fs.rm(p, { force: true })));
});

const validEntry = {
  email: "pilot-beyond-clean@restoreassist.sandbox",
  password: "x".repeat(24),
  workspaceName: "Beyond Clean (sandbox pilot)",
  companyKey: "beyond-clean",
};

describe("loadUserPool identity containment", () => {
  it("accepts a pool of synthetic pilot identities", async () => {
    const p = await poolFile([validEntry]);
    await expect(loadUserPool(p)).resolves.toHaveLength(1);
  });

  it("refuses an entry with a real-looking email (wrong domain)", async () => {
    const p = await poolFile([
      { ...validEntry, email: "phill@restoreassist.com.au" },
    ]);
    await expect(loadUserPool(p)).rejects.toThrow(/not a synthetic pilot/);
  });

  it("refuses an entry without the pilot- prefix even on the sandbox domain", async () => {
    const p = await poolFile([
      { ...validEntry, email: "admin@restoreassist.sandbox" },
    ]);
    await expect(loadUserPool(p)).rejects.toThrow(/not a synthetic pilot/);
  });

  it("never echoes the password when refusing an entry", async () => {
    const p = await poolFile([
      { ...validEntry, email: "someone@gmail.com", password: "SUPERSECRET-99" },
    ]);
    await expect(loadUserPool(p)).rejects.toThrow(
      expect.not.objectContaining({ message: expect.stringContaining("SUPERSECRET-99") }),
    );
  });

  it("still rejects structurally malformed entries", async () => {
    const p = await poolFile([{ email: "pilot-x@restoreassist.sandbox" }]);
    await expect(loadUserPool(p)).rejects.toThrow(/malformed/);
  });
});
