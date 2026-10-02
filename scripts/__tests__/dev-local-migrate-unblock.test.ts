import { describe, expect, it } from "vitest";
import {
  REPLAY_INDEX_MIGRATION,
  assertLocalDatabaseUrl,
} from "../dev-local-migrate-unblock";

describe("dev-local-migrate-unblock", () => {
  it("names the replay-index migration CI pre-resolves", () => {
    expect(REPLAY_INDEX_MIGRATION).toBe(
      "20260828213100_job_file_audit_intake_replay_guard_index",
    );
  });

  it("allows localhost DATABASE_URL", () => {
    expect(() =>
      assertLocalDatabaseUrl("postgresql://u:p@localhost:5432/restore_assist"),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabaseUrl("postgres://u:p@127.0.0.1:5432/db"),
    ).not.toThrow();
  });

  it("refuses remote DATABASE_URL", () => {
    expect(() =>
      assertLocalDatabaseUrl("postgresql://u:p@db.example.com:5432/prod"),
    ).toThrow(/non-local host/);
  });
});
