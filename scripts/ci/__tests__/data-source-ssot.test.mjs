/**
 * check-data-source-ssot.mjs — what it must flag, and what it must not.
 *
 * The detector exists for the RA-7026 shape: two models carrying the same
 * data under different @unique keys. It must keep flagging that. It must not
 * flag two unrelated models just because both point at the same parents: a
 * relation object (`client Client`) is the same link as its foreign key
 * (`clientId`), so counting both doubled every shared parent.
 * PortalInvitation and Inspection tripped it on clientId/client/userId/user/
 * status/acceptedAt (16/10/2026) while sharing no data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "check-data-source-ssot.mjs");

function run(schema) {
  const dir = mkdtempSync(join(tmpdir(), "ssot-"));
  const file = join(dir, "schema.prisma");
  writeFileSync(file, schema);
  return spawnSync(process.execPath, [SCRIPT, "--strict", "--schema", file], { encoding: "utf8" });
}

const PARENTS = `
model Client {
  id String @id
}

model User {
  id String @id
}
`;

test("a field-identical pair under different @unique keys is flagged (the RA-7026 shape)", () => {
  const fields = ["markupPct", "labourRate", "travelRate", "minimumCharge", "gstRate", "currency", "roundingMode"]
    .map((f) => `  ${f} String`)
    .join("\n");
  const r = run(`${PARENTS}
model UserPricing {
  id     String @id
  userId String @unique
${fields}
}

model OrgPricing {
  id    String @id
  orgId String @unique
${fields}
}
`);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /OrgPricing|UserPricing/);
});

test("a field-identical pair whose shared fields include a many-to-many relation (no FK scalar) is flagged", () => {
  // Codex review af36483c0: skipping every relation object let this pair through.
  const r = run(`${PARENTS}
model Tag {
  id String @id
}

model UserPlan {
  id            String @id
  userId        String @unique
  labourRate    String
  travelRate    String
  currency      String
  roundingMode  String
  minimumCharge String
  tags          Tag[]
}

model OrgPlan {
  id            String @id
  orgId         String @unique
  labourRate    String
  travelRate    String
  currency      String
  roundingMode  String
  minimumCharge String
  tags          Tag[]
}
`);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /OrgPlan|UserPlan/);
});

test("two models sharing only parent links and generic names are not flagged", () => {
  const r = run(`${PARENTS}
model Invitation {
  id         String  @id
  token      String  @unique
  email      String
  clientId   String
  client     Client  @relation(fields: [clientId], references: [id])
  userId     String
  user       User    @relation(fields: [userId], references: [id])
  status     String
  expiresAt  DateTime
  acceptedAt DateTime?
}

model Job {
  id         String  @id
  jobNumber  String  @unique
  clientId   String?
  client     Client? @relation(fields: [clientId], references: [id])
  userId     String
  user       User    @relation(fields: [userId], references: [id])
  status     String
  acceptedAt DateTime?
  address    String
  postcode   String
}
`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
