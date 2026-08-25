import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260825124000_outbound_delivery_and_media_cleanup/migration.sql",
  "utf8",
);
const nonceMigration = readFileSync(
  "prisma/migrations/20260825130000_native_auth_nonce/migration.sql",
  "utf8",
);

describe("service-only delivery ledgers", () => {
  for (const table of ["OutboundEmailDelivery", "MediaCleanupTask"]) {
    it(`${table} enables RLS without a client policy`, () => {
      expect(migration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(migration).not.toMatch(
        new RegExp(`CREATE\\s+POLICY[\\s\\S]*ON\\s+"${table}"`, "i"),
      );
    });
  }

  it("keeps native authentication challenges service-only", () => {
    expect(nonceMigration).toContain(
      'ALTER TABLE "NativeAuthNonce" ENABLE ROW LEVEL SECURITY',
    );
    expect(nonceMigration).not.toMatch(/CREATE\s+POLICY[\s\S]*ON\s+"NativeAuthNonce"/i);
  });
});
