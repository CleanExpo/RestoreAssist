/**
 * Fixture for scripts/ci/__tests__/test-db-guard-wiring.test.ts, which runs
 * this file in a child vitest under each config. In an ordinary run
 * DB_GUARD_FIXTURE is unset and the test passes without doing anything.
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { describe, expect, it } from "vitest";

const mode = process.env.DB_GUARD_FIXTURE;

describe("test database guard fixture", () => {
  it("runs only when the wiring test asks", async () => {
    if (mode === "sentinel") {
      // The guard should have refused this file before any body ran.
      writeFileSync(process.env.DB_GUARD_MARKER as string, "a test body ran");
    }
    if (mode === "swallow") {
      // A caller that catches the refusal must not hide it from the run: this
      // test passes, and the guard's afterAll fails the file.
      // Only the host comes in through env: a whole URL there is refused at setup.
      const pool = new pg.Pool({ connectionString: `postgresql://u:p@${process.env.DB_GUARD_REMOTE_HOST}/x` });
      const outcome = await pool.connect().catch((error: unknown) => error);
      await pool.end().catch(() => null);
      expect(outcome).toBeInstanceOf(Error);
      return;
    }
    expect(mode, "fixture is inactive in an ordinary run").toBeUndefined();
  });
});
