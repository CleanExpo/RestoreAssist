/**
 * RA-8668 - every change to a portal invitation's status lives in
 * lib/portal/invitation-transitions.ts, where each one is a compare-and-set on
 * the status it expects. A status write anywhere else is how a request that
 * read an old status came to overwrite ACCEPTED or REVOKED.
 *
 * This is an allow-list, not a search for known bad calls: outside the owner,
 * the `portalInvitation` accessor may only be followed by a read or a create.
 * Anything else, including handing the accessor to a variable, fails here.
 *
 * Two other roads reach the same table without the accessor, and both are
 * closed in every source file: a nested write anywhere inside a Client or
 * User relation block, and the quoted table name that raw SQL has to use.
 *
 * Limit: this reads source text. A model picked by a name built at run time
 * (`prisma[name]`) is out of its reach; no source file does that today.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const OWNER = "lib/portal/invitation-transitions.ts";
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;
const SKIPPED_DIRS = new Set([
  "node_modules",
  "__tests__",
  "e2e",
  "tests",
  "dist",
  "build",
  "out",
  "coverage",
]);
const ACCESSOR = /\bportalInvitation\b/g;
const READ_OR_CREATE =
  /^\s*\.\s*(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|create)\s*\(/;
const CONDITIONAL_WRITE = /^\s*\.\s*updateMany\s*\(\s*\{\s*where:\s*\{[^}]*\bstatus\s*:/;
// The relation fields that point at PortalInvitation (User.portalInvitations,
// Client.invitations in prisma/schema.prisma), where they open a block.
const RELATION_BLOCK = /\b(portalInvitations|invitations)\s*:\s*\{/g;
// Every nested operation that changes or removes rows. A plain create is not
// one; a read (where, select, include, orderBy) names none of these.
const NESTED_WRITE_KEY =
  /\b(connect|connectOrCreate|disconnect|set|update|updateMany|upsert|delete|deleteMany)\b/;
// Postgres needs the mixed-case table name in double quotes, so raw SQL on the
// table always carries the quoted name, whatever the statement. No source file
// carries it today, so the quoted name itself is refused, not a list of verbs.
const QUOTED_TABLE_NAME = /\\?"PortalInvitation\\?"/g;

const lineOf = (source: string, index: number) =>
  source.slice(0, index).split("\n").length;

/** Lines where `pattern` matches. */
function linesMatching(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map((match) => lineOf(source, match.index));
}

/** The text from the brace at `open` to the brace that closes it. */
function blockFrom(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, at + 1);
    }
  }
  // Never closed: judge everything that follows.
  return source.slice(open);
}

/** Lines where a relation block holds a nested write, at any position in it. */
function nestedWrites(source: string): number[] {
  return [...source.matchAll(RELATION_BLOCK)]
    .filter((match) =>
      NESTED_WRITE_KEY.test(
        blockFrom(source, match.index + match[0].length - 1),
      ),
    )
    .map((match) => lineOf(source, match.index));
}

/** Lines where the accessor is followed by something `allowed` does not match. */
function usesOutside(source: string, allowed: RegExp): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(ACCESSOR)) {
    const rest = source.slice(match.index + match[0].length);
    if (!allowed.test(rest)) {
      lines.push(lineOf(source, match.index));
    }
  }
  return lines;
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) sourceFiles(full, found);
    } else if (
      entry.isFile() &&
      SOURCE_FILE.test(entry.name) &&
      !TEST_FILE.test(entry.name)
    ) {
      found.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return found;
}

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("the checker itself", () => {
  it("accepts reads and creates", () => {
    const source = [
      "await prisma.portalInvitation.findUnique({ where: { token } });",
      "await tx.portalInvitation\n  .findMany({ where });",
      "await tx.portalInvitation.create({ data });",
    ].join("\n");
    expect(usesOutside(source, READ_OR_CREATE)).toEqual([]);
  });

  it("refuses every kind of write and any handing-off of the accessor", () => {
    const source = [
      "await prisma.portalInvitation.update({ where: { id }, data });",
      "await prisma.portalInvitation.updateMany({ where: { id }, data });",
      "await prisma.portalInvitation.upsert({ where: { id }, create, update });",
      "await prisma.portalInvitation.delete({ where: { id } });",
      'await prisma.portalInvitation["update"]({ where: { id }, data });',
      "const table = prisma.portalInvitation;",
    ].join("\n");
    expect(usesOutside(source, READ_OR_CREATE)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("tells a write that is conditional on status from one that is not", () => {
    const conditional =
      'db.portalInvitation.updateMany({ where: { id, status: "PENDING" }, data });';
    const unconditional = "db.portalInvitation.updateMany({ where: { id }, data });";
    const single = "db.portalInvitation.update({ where: { id }, data });";
    expect(usesOutside(conditional, CONDITIONAL_WRITE)).toEqual([]);
    expect(usesOutside(unconditional, CONDITIONAL_WRITE)).toEqual([1]);
    expect(usesOutside(single, CONDITIONAL_WRITE)).toEqual([1]);
  });

  it("refuses a nested write through a relation, and allows a read or a create", () => {
    const source = [
      "await prisma.client.update({ where, data: { invitations: { updateMany: { where: {}, data } } } });",
      "await prisma.user.update({ where, data: { portalInvitations: {\n  deleteMany: {} } } });",
      "await prisma.client.findFirst({ where, include: { invitations: { where: { status } } } });",
      "await prisma.client.update({ where, data: { invitations: { create: { email } } } });",
      "await prisma.user.findFirst({ where, select: { portalInvitations: true } });",
      "await prisma.client.update({ where, data: { invitations: { create: { email }, deleteMany: {} } } });",
      "await prisma.user.update({ where, data: { portalInvitations: { create: { email },\n  update: { where: { id }, data } } } });",
      "await prisma.client.findFirst({ where, select: { invitations: { where: { status }, orderBy: { createdAt } } } });",
    ].join("\n");
    // Entries two and seven each span two lines.
    expect(nestedWrites(source)).toEqual([1, 2, 7, 8]);
  });

  it("refuses the quoted table name, whatever the SQL around it", () => {
    const source = [
      'await prisma.$executeRaw`UPDATE "PortalInvitation" SET status = \'EXPIRED\'`;',
      'await prisma.$executeRawUnsafe("delete from \\"PortalInvitation\\" where id = $1", id);',
      'await prisma.$queryRaw`SELECT 1 FROM "public"."PortalInvitation"`;',
      'await prisma.$executeRaw`TRUNCATE "PortalInvitation"`;',
      'const label = "PortalInvitation";',
      "import type { PortalInvitation } from \"@prisma/client\";",
      "// The PortalInvitation row is read above.",
    ].join("\n");
    expect(linesMatching(source, QUOTED_TABLE_NAME)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("portal invitation status writes", () => {
  const files = sourceFiles(ROOT);
  // `includes`, not ACCESSOR.test: a global regex remembers where it stopped.
  const users = files.filter((file) => read(file).includes("portalInvitation"));

  it("looked at the files that use invitations", () => {
    expect(users).toEqual(
      expect.arrayContaining([
        OWNER,
        "app/api/portal/invitations/route.ts",
        "app/api/portal/invitations/accept/route.ts",
        "app/api/portal/invitations/verify/route.ts",
        "app/api/portal/invitations/[id]/route.ts",
        "lib/portal/request-invitation-resend.ts",
      ]),
    );
  });

  it("are made nowhere but the owner", () => {
    const offenders = users
      .filter((file) => file !== OWNER)
      .flatMap((file) =>
        usesOutside(read(file), READ_OR_CREATE).map((line) => `${file}:${line}`),
      );
    expect(offenders).toEqual([]);
  });

  it("are not made through a relation or raw SQL anywhere", () => {
    // Every source file, not only the ones that name the accessor: neither
    // road needs it.
    expect(files.length).toBeGreaterThan(500);
    const offenders = files.flatMap((file) => {
      const source = read(file);
      return [
        ...nestedWrites(source),
        ...linesMatching(source, QUOTED_TABLE_NAME),
      ].map((line) => `${file}:${line}`);
    });
    expect(offenders).toEqual([]);
  });

  it("are all conditional on the current status inside the owner", () => {
    const source = read(OWNER);
    expect(source.match(ACCESSOR)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(usesOutside(source, CONDITIONAL_WRITE)).toEqual([]);
  });
});
