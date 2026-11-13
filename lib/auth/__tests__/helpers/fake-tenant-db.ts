/**
 * A small in-memory stand-in for Prisma, for tests of figures. It evaluates the
 * real `where` a route builds against seeded rows, so removing a tenancy clause
 * changes the number and fails the test. An operator it does not know throws
 * rather than matching everything.
 */
import { vi } from "vitest";

type Row = Record<string, any>;
type Where = Record<string, any> | undefined;

const tables: Record<string, Row[]> = {};
/** Every read against a model, in order, for query-count assertions. */
export const calls: string[] = [];
/** Models whose count, aggregate or groupBy should reject, to prove failure paths. */
export const failing = new Set<string>();

export function seed(next: Record<string, Row[]>): void {
  for (const key of Object.keys(tables)) delete tables[key];
  Object.assign(tables, next);
  calls.length = 0;
  failing.clear();
  fakePrisma.$queryRaw.mockClear();
  fakePrisma.$transaction.mockClear();
}

const RELATIONS: Record<string, { table: string; fk: string }> = {
  user: { table: "user", fk: "userId" },
  inspection: { table: "inspection", fk: "inspectionId" },
  workspace: { table: "workspace", fk: "workspaceId" },
};

/** A client's child relations, by the name `include` uses. */
const INCLUDES: Record<string, string> = { reports: "report" };

function compare(actual: any, filter: any): boolean {
  if (filter === undefined) return true;
  if (filter === null) return actual === null || actual === undefined;
  if (filter instanceof Date) return time(actual) === filter.getTime();
  if (typeof filter !== "object") return actual === filter;
  return Object.entries(filter).every(([op, value]: [string, any]) => {
    if (value === undefined) return true;
    switch (op) {
      case "in":
        return value.includes(actual);
      case "notIn":
        return !value.includes(actual);
      case "not":
        return !compare(actual, value);
      case "gte":
        return actual != null && time(actual) >= time(value);
      case "gt":
        return actual != null && time(actual) > time(value);
      case "lte":
        return actual != null && time(actual) <= time(value);
      case "lt":
        return actual != null && time(actual) < time(value);
      default:
        throw new Error(`fake-tenant-db: unknown operator ${op}`);
    }
  });
}

function time(value: any): number {
  return value instanceof Date ? value.getTime() : value;
}

export function matches(row: Row, where: Where): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, filter]) => {
    if (filter === undefined) return true;
    if (key === "AND") {
      return [filter].flat().every((w: Where) => matches(row, w));
    }
    if (key === "OR") return filter.some((w: Where) => matches(row, w));
    if (key === "NOT") {
      return ![filter].flat().some((w: Where) => matches(row, w));
    }
    if (key === "members") {
      return (row.members ?? []).some((m: Row) => matches(m, filter.some));
    }
    const relation = RELATIONS[key];
    if (relation) {
      const target = (tables[relation.table] ?? []).find(
        (r) => r.id === row[relation.fk],
      );
      return Boolean(target) && matches(target as Row, filter);
    }
    return compare(row[key], filter);
  });
}

function rows(model: string, where: Where): Row[] {
  return (tables[model] ?? []).filter((r) => matches(r, where));
}

function pick(row: Row, select?: Record<string, boolean>): Row {
  if (!select) return row;
  return Object.fromEntries(Object.keys(select).map((k) => [k, row[k] ?? null]));
}

function ordered(list: Row[], orderBy?: Record<string, "asc" | "desc">): Row[] {
  if (!orderBy) return list;
  const [[key, dir]] = Object.entries(orderBy);
  const sign = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => (time(a[key]) > time(b[key]) ? sign : -sign));
}

function sums(list: Row[], fields?: Record<string, boolean>): Row {
  return Object.fromEntries(
    Object.keys(fields ?? {}).map((f) => [
      f,
      list.length ? list.reduce((total, r) => total + (r[f] ?? 0), 0) : null,
    ]),
  );
}

function modelApi(model: string) {
  const guard = () => {
    calls.push(model);
    if (failing.has(model)) throw new Error(`${model} read failed`);
  };
  return {
    count: vi.fn(async ({ where }: any = {}) => {
      guard();
      return rows(model, where).length;
    }),
    aggregate: vi.fn(async ({ where, _sum, _count }: any) => {
      guard();
      const list = rows(model, where);
      return { _sum: sums(list, _sum), ...(_count ? { _count: list.length } : {}) };
    }),
    groupBy: vi.fn(async ({ by, where, _sum, _max, _count }: any) => {
      guard();
      const groups = new Map<string, Row[]>();
      for (const r of rows(model, where)) {
        const key = by.map((f: string) => r[f]).join("|");
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      return [...groups.values()].map((list) => ({
        ...Object.fromEntries(by.map((f: string) => [f, list[0][f]])),
        _sum: sums(list, _sum),
        _max: Object.fromEntries(
          Object.keys(_max ?? {}).map((f) => [
            f,
            ordered(list, { [f]: "desc" })[0][f],
          ]),
        ),
        ...(_count ? { _count: { _all: list.length } } : {}),
      }));
    }),
    findMany: vi.fn(async ({ where, orderBy, skip, take, select }: any = {}) => {
      guard();
      return ordered(rows(model, where), orderBy)
        .slice(skip ?? 0, take === undefined ? undefined : (skip ?? 0) + take)
        .map((r) => pick(r, select));
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return rows(model, where)[0] ?? null;
    }),
    findFirst: vi.fn(async ({ where, include }: any) => {
      guard();
      const row = rows(model, where)[0];
      if (!row) return null;
      const out: Row = { ...row };
      for (const [name, spec] of Object.entries<any>(include ?? {})) {
        if (name === "_count") continue;
        const related = ordered(
          (tables[INCLUDES[name]] ?? []).filter((r) => r.clientId === row.id),
          spec.orderBy,
        );
        out[name] = related.slice(0, spec.take).map((r) => pick(r, spec.select));
      }
      if (include?._count) {
        out._count = Object.fromEntries(
          Object.keys(include._count.select).map((name) => [
            name,
            (tables[INCLUDES[name]] ?? []).filter((r) => r.clientId === row.id)
              .length,
          ]),
        );
      }
      return out;
    }),
  };
}

export const fakePrisma = {
  user: modelApi("user"),
  inspection: modelApi("inspection"),
  moistureReading: modelApi("moistureReading"),
  scopeItem: modelApi("scopeItem"),
  invoice: modelApi("invoice"),
  client: modelApi("client"),
  report: modelApi("report"),
  inspectionPhoto: modelApi("inspectionPhoto"),
  waterDamageClassification: modelApi("waterDamageClassification"),
  // Hand-written SQL cannot be evaluated here, and no figure may depend on it.
  $queryRaw: vi.fn(async () => []),
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};

/** One business with an owner, a manager and a technician, and one other business. */
export const USERS: Row[] = [
  { id: "admin-a", role: "ADMIN", organizationId: "org-a", email: "a@example.test" },
  { id: "manager-a", role: "MANAGER", organizationId: "org-a", email: "m@example.test" },
  { id: "tech-a", role: "USER", organizationId: "org-a", email: "t@example.test" },
  { id: "admin-b", role: "ADMIN", organizationId: "org-b", email: "b@example.test" },
];

export function sessionFor(id: string) {
  return { user: { id } };
}
