/**
 * RA-8624 — structural guard: a transaction that writes an agent task row
 * takes the workflow lock first, and never takes a workflow lock after it has
 * written a task row.
 *
 * Two writers that take the task row lock and the workflow row lock in
 * opposite order deadlock (approve against cancel, RA-8624). The rule lives in
 * lib/agents/workflow-lock.ts; withWorkflowLock owns it for one workflow. This
 * test reads the source of every transaction under lib/agents and the account
 * delete route, so a new caller that gets the order wrong fails here before it
 * reaches a database.
 *
 * Limit: it sees calls written inside the transaction body only. A helper
 * called with `tx` that writes tasks (skipDependentsOfFailedTask,
 * refreshWorkflowProgress) is not followed; every current call of those sits
 * after the lock.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..");

const LOCK = /\b(lockWorkflowRow|lockWorkflowRows|lockOpenWorkflowsOfUser)\s*\(/g;
const TASK_WRITE =
  /\.agentTask\.(update|updateMany|upsert|delete|deleteMany)\s*\(|UPDATE\s+"AgentTask"|DELETE\s+FROM\s+"AgentTask"/g;
const OPENER = /(\$transaction|withWorkflowLock)\s*\(/g;

interface Violation {
  where: string;
  reason: string;
}

/** Text from the opening paren to its matching close. */
function balancedBody(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(openParen, i + 1);
  }
  return src.slice(openParen);
}

function indices(re: RegExp, text: string): number[] {
  return [...text.matchAll(re)].map((m) => m.index ?? 0);
}

function lockOrderViolations(src: string, file: string): { checked: number; violations: Violation[] } {
  const violations: Violation[] = [];
  let checked = 0;
  for (const m of src.matchAll(OPENER)) {
    const start = m.index ?? 0;
    // The helper's own definition and import lines are not calls.
    if (/function\s+$/.test(src.slice(Math.max(0, start - 12), start))) continue;
    const body = balancedBody(src, start + m[0].length - 1);
    const line = src.slice(0, start).split("\n").length;
    const where = `${file}:${line}`;
    const writes = indices(TASK_WRITE, body);
    const locks = indices(LOCK, body);
    checked++;
    if (writes.length === 0) continue;
    const firstWrite = writes[0];
    const lockedByHelper = m[1] === "withWorkflowLock";
    if (!lockedByHelper && (locks.length === 0 || locks[0] > firstWrite)) {
      violations.push({ where, reason: "writes a task row before it takes the workflow lock" });
    }
    if (locks.some((at) => at > firstWrite)) {
      violations.push({ where, reason: "takes a workflow lock after it wrote a task row" });
    }
  }
  return { checked, violations };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("RA-8624 workflow lock comes before any task write", () => {
  it("flags a transaction that writes the task before the lock (the old decideApproval)", () => {
    const planted = `
      await prisma.$transaction(async (tx) => {
        const moved = await tx.agentTask.updateMany({ where: { id }, data: { status: "READY" } });
        await lockWorkflowRow(tx, workflowId);
      });`;
    const { violations } = lockOrderViolations(planted, "planted.ts");
    expect(violations.map((v) => v.reason)).toContain(
      "writes a task row before it takes the workflow lock",
    );
  });

  it("flags a transaction that locks more workflows after a raw task UPDATE (the old lease sweep)", () => {
    const planted = `
      return prisma.$transaction(async (tx) => {
        await lockWorkflowRows(tx, locked);
        const rows = await tx.$queryRaw\`UPDATE "AgentTask" t SET status = 'READY'\`;
        await lockWorkflowRows(tx, more);
      });`;
    const { violations } = lockOrderViolations(planted, "planted.ts");
    expect(violations.map((v) => v.reason)).toEqual([
      "takes a workflow lock after it wrote a task row",
    ]);
  });

  it("flags a task write with no lock at all, and passes lock-first and helper callers", () => {
    const unlocked = `await prisma.$transaction(async (tx) => { await tx.agentTask.update({ where: { id } }); });`;
    expect(lockOrderViolations(unlocked, "planted.ts").violations).toHaveLength(1);

    const lockFirst = `await prisma.$transaction(async (tx) => {
      await lockWorkflowRow(tx, workflowId);
      await tx.agentTask.updateMany({ where: { workflowId } });
    });`;
    expect(lockOrderViolations(lockFirst, "planted.ts").violations).toEqual([]);

    const helper = `await withWorkflowLock(workflowId, async (tx) => {
      await tx.agentTask.updateMany({ where: { workflowId } });
    });`;
    expect(lockOrderViolations(helper, "planted.ts").violations).toEqual([]);
  });

  it("every transaction under lib/agents and the account delete route takes the lock first", () => {
    const files = [
      ...sourceFiles(join(ROOT, "lib", "agents")),
      join(ROOT, "app", "api", "account", "delete", "route.ts"),
    ];
    let checked = 0;
    const violations: Violation[] = [];
    for (const file of files) {
      const result = lockOrderViolations(readFileSync(file, "utf8"), relative(ROOT, file));
      checked += result.checked;
      violations.push(...result.violations);
    }
    // Positive control: the scan reached the writers this ticket is about.
    const scanned = files.map((f) => relative(ROOT, f));
    expect(scanned).toContain(join("lib", "agents", "approval.ts"));
    expect(scanned).toContain(join("lib", "agents", "lease.ts"));
    expect(checked).toBeGreaterThanOrEqual(8);
    expect(violations).toEqual([]);
  });
});
