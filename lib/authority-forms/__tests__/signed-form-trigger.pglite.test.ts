/**
 * RA-8526 — the proposed database backstop, run against real Postgres
 * (PGlite, in process, no network, no shared database).
 *
 * The SQL under test is prisma/proposed/ra_8526_signed_authority_form_immutable/
 * migration.sql, read from disk unchanged. It is NOT in prisma/migrations and
 * is applied here only to a throwaway in-memory database.
 *
 * The tables below carry the real column names from prisma/schema.prisma and
 * the real cascade chain User -> Report -> AuthorityFormInstance ->
 * AuthorityFormSignature.
 *
 * PGlite is installed through the prisma devDependency (@prisma/dev). If it
 * ever goes missing the import fails and this suite fails; it never skips.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const SQL = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "..",
    "prisma",
    "proposed",
    "ra_8526_signed_authority_form_immutable",
    "migration.sql",
  ),
  "utf8",
);

const SCHEMA = `
CREATE TABLE "User" ("id" text PRIMARY KEY);
CREATE TABLE "Report" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE TABLE "AuthorityFormInstance" (
  "id" text PRIMARY KEY,
  "reportId" text NOT NULL REFERENCES "Report"("id") ON DELETE CASCADE,
  "templateId" text NOT NULL DEFAULT 't1',
  "companyName" text NOT NULL DEFAULT 'Synthetic Co',
  "clientName" text NOT NULL DEFAULT 'Synthetic Client',
  "clientAddress" text NOT NULL DEFAULT '1 Synthetic St',
  "authorityDescription" text NOT NULL DEFAULT 'Authority to commence',
  "status" text NOT NULL DEFAULT 'PENDING_SIGNATURES',
  "pdfUrl" text,
  "draftPdfUrl" text,
  "completedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "AuthorityFormSignature" (
  "id" text PRIMARY KEY,
  "instanceId" text NOT NULL REFERENCES "AuthorityFormInstance"("id") ON DELETE CASCADE,
  "signatoryName" text NOT NULL,
  "signatoryRole" text NOT NULL DEFAULT 'CLIENT',
  "signatoryEmail" text,
  "signatoryPhone" text,
  "signatureData" text,
  "signatureUrl" text,
  "signatureRequestSent" boolean NOT NULL DEFAULT false,
  "signatureRequestSentAt" timestamp,
  "signatureRequestToken" text UNIQUE,
  "ipAddress" text,
  "userAgent" text,
  "signedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);`;

const FIXTURE = `
INSERT INTO "User" VALUES ('u1');
INSERT INTO "Report" VALUES ('r-signed', 'u1'), ('r-open', 'u1');
INSERT INTO "AuthorityFormInstance" ("id", "reportId") VALUES ('f-signed', 'r-signed'), ('f-open', 'r-open');
INSERT INTO "AuthorityFormSignature" ("id", "instanceId", "signatoryName", "signatureRequestToken")
  VALUES ('s-signed', 'f-signed', 'Client A', 'tok-a'),
         ('s-pending', 'f-signed', 'Owner B', 'tok-b'),
         ('s-open', 'f-open', 'Client C', 'tok-c');
UPDATE "AuthorityFormSignature"
  SET "signedAt" = now(), "signatureData" = 'data:image/png;base64,AAAA', "ipAddress" = '203.0.113.5'
  WHERE "id" = 's-signed';`;

let db: PGlite;

async function refused(sql: string): Promise<string> {
  try {
    await db.exec(sql);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error(`expected the database to refuse: ${sql}`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SQL);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    BEGIN;
    SET LOCAL restoreassist.allow_signed_form_erasure = 'on';
    DELETE FROM "User";
    COMMIT;`);
  await db.exec(FIXTURE);
});

describe("proposed signed-form triggers (RA-8526)", () => {
  it("refuses deleting a signed signature", async () => {
    expect(await refused(`DELETE FROM "AuthorityFormSignature" WHERE "id" = 's-signed'`)).toMatch(
      /has been signed; signature slot s-signed cannot be deleted/,
    );
  });

  // Round 2 review: the executed PDF shows pending slots too, so once anyone
  // has signed, a pending slot on that form is part of the record.
  it("refuses deleting or rewriting a pending slot on a signed form", async () => {
    expect(await refused(`DELETE FROM "AuthorityFormSignature" WHERE "id" = 's-pending'`)).toMatch(
      /signature slot s-pending cannot be deleted/,
    );
    for (const set of [
      `"signatoryName" = 'Someone Else'`,
      `"signatoryRole" = 'PROPERTY_OWNER'`,
      `"signatoryEmail" = 'other@example.test'`,
      `"createdAt" = now() + interval '1 day'`,
    ]) {
      expect(
        await refused(`UPDATE "AuthorityFormSignature" SET ${set} WHERE "id" = 's-pending'`),
      ).toMatch(/signature slot s-pending cannot be changed/);
    }
  });

  it("lets a pending slot on a signed form be signed once, filling only its signature", async () => {
    expect(
      await refused(
        `UPDATE "AuthorityFormSignature" SET "signedAt" = now(), "signatoryRole" = 'PROPERTY_OWNER' WHERE "id" = 's-pending'`,
      ),
    ).toMatch(/may only fill its signature/);
    await db.exec(`UPDATE "AuthorityFormSignature" SET "signatureRequestToken" = NULL WHERE "id" = 's-pending'`);
    await db.exec(
      `UPDATE "AuthorityFormSignature" SET "signedAt" = now(), "signatureData" = 'data:image/png;base64,BBBB', "signatoryName" = 'Owner B Typed', "ipAddress" = '203.0.113.9', "userAgent" = 'Synthetic' WHERE "id" = 's-pending'`,
    );
    expect(
      await refused(`UPDATE "AuthorityFormSignature" SET "signatureData" = 'x' WHERE "id" = 's-pending'`),
    ).toMatch(/cannot be changed/);
  });

  it("refuses the cascades from the form, the report and the user", async () => {
    for (const sql of [
      `DELETE FROM "AuthorityFormInstance" WHERE "id" = 'f-signed'`,
      `DELETE FROM "Report" WHERE "id" = 'r-signed'`,
      `DELETE FROM "User" WHERE "id" = 'u1'`,
    ]) {
      expect(await refused(sql)).toMatch(/cannot be deleted/);
    }
    const left = await db.query(`SELECT count(*)::int AS n FROM "AuthorityFormSignature"`);
    expect(left.rows).toEqual([{ n: 3 }]);
  });

  it("refuses a new signatory on a signed form", async () => {
    expect(
      await refused(
        `INSERT INTO "AuthorityFormSignature" ("id", "instanceId", "signatoryName") VALUES ('s-new', 'f-signed', 'Late Party')`,
      ),
    ).toMatch(/cannot take a new signatory/);
  });

  it("freezes every evidence column of a signed signature, createdAt included", async () => {
    for (const set of [
      `"signatureData" = 'x'`,
      `"signatoryName" = 'Someone Else'`,
      `"signedAt" = now() - interval '1 day'`,
      `"ipAddress" = '198.51.100.1'`,
      `"instanceId" = 'f-open'`,
      `"createdAt" = now() + interval '1 day'`,
    ]) {
      expect(
        await refused(`UPDATE "AuthorityFormSignature" SET ${set} WHERE "id" = 's-signed'`),
      ).toMatch(/cannot be changed/);
    }
  });

  it("still lets a signing link be revoked on a signed row", async () => {
    await db.exec(
      `UPDATE "AuthorityFormSignature" SET "signatureRequestToken" = NULL, "updatedAt" = now() WHERE "id" = 's-signed'`,
    );
  });

  it("freezes the wording of a signed form but lets signing complete it", async () => {
    expect(
      await refused(
        `UPDATE "AuthorityFormInstance" SET "authorityDescription" = 'Changed' WHERE "id" = 'f-signed'`,
      ),
    ).toMatch(/cannot be changed/);
    await db.exec(
      `UPDATE "AuthorityFormInstance" SET "status" = 'COMPLETED', "completedAt" = now(), "pdfUrl" = 'https://example.test/a.pdf' WHERE "id" = 'f-signed'`,
    );
  });

  it("leaves unsigned forms and slots fully editable and deletable", async () => {
    await db.exec(`UPDATE "AuthorityFormInstance" SET "authorityDescription" = 'Edited' WHERE "id" = 'f-open'`);
    await db.exec(`INSERT INTO "AuthorityFormSignature" ("id", "instanceId", "signatoryName") VALUES ('s-extra', 'f-open', 'Extra')`);
    await db.exec(`UPDATE "AuthorityFormSignature" SET "signatoryName" = 'Client C2' WHERE "id" = 's-open'`);
    await db.exec(`DELETE FROM "AuthorityFormSignature" WHERE "id" = 's-extra'`);
    await db.exec(`DELETE FROM "Report" WHERE "id" = 'r-open'`);
  });

  it("allows erasure only inside a session that sets the erasure switch", async () => {
    await db.exec(`
      BEGIN;
      SET LOCAL restoreassist.allow_signed_form_erasure = 'on';
      DELETE FROM "Report" WHERE "id" = 'r-signed';
      COMMIT;`);
    expect(
      (await db.query(`SELECT count(*)::int AS n FROM "AuthorityFormInstance" WHERE "id" = 'f-signed'`)).rows,
    ).toEqual([{ n: 0 }]);
  });
});
