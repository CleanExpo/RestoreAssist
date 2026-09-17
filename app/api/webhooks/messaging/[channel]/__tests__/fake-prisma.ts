/**
 * In-memory Prisma stand-in for the Text the Job In webhook tests.
 *
 * Every `where` matcher throws on a key it does not model, so a query that
 * silently drops or renames a clause (for example the tenancy scope) fails
 * loudly instead of matching everything. `InboundJobMessage.externalId` is
 * unique and raises P2002 like Postgres does.
 */

type Row = Record<string, any>;

export interface FakeState {
  users: Row[];
  workspaceMembers: Row[];
  inspections: Row[];
  identities: Row[];
  messages: Row[];
  tokens: Row[];
  sessions: Row[];
  observations: Row[];
}

let clock = Date.UTC(2026, 8, 17, 0, 0, 0);
let seq = 0;

export function tick(): Date {
  clock += 1000;
  return new Date(clock);
}

export const state: FakeState = {
  users: [],
  workspaceMembers: [],
  inspections: [],
  identities: [],
  messages: [],
  tokens: [],
  sessions: [],
  observations: [],
};

export function resetState(): void {
  for (const key of Object.keys(state) as (keyof FakeState)[]) {
    state[key].length = 0;
  }
}

function unknownKey(model: string, key: string): never {
  throw new Error(`fake-prisma: ${model} where key "${key}" is not modelled`);
}

function pick(row: Row, select?: Row): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) {
    if (!v) continue;
    if (k === "user" && typeof v === "object") {
      const user = state.users.find((u) => u.id === row.userId);
      out.user = user ? pick(user, (v as Row).select) : null;
    } else {
      out[k] = row[k];
    }
  }
  return out;
}

function matchDate(value: Date, cond: Row): boolean {
  for (const [op, arg] of Object.entries(cond)) {
    const t = (arg as Date).getTime();
    if (op === "lte" && !(value.getTime() <= t)) return false;
    else if (op === "gt" && !(value.getTime() > t)) return false;
    else if (op !== "lte" && op !== "gt") unknownKey("date", op);
  }
  return true;
}

function matchInspection(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    switch (key) {
      case "AND":
        if (!(cond as Row[]).every((w) => matchInspection(row, w))) return false;
        break;
      case "OR":
        if (!(cond as Row[]).some((w) => matchInspection(row, w))) return false;
        break;
      case "id":
      case "userId":
      case "technicianId":
        if (row[key] !== cond) return false;
        break;
      case "status": {
        const c = cond as Row;
        if (Object.keys(c).some((k) => k !== "notIn")) unknownKey("status", "?");
        if ((c.notIn as string[]).includes(row.status)) return false;
        break;
      }
      case "inspectionNumber": {
        const c = cond as Row;
        if (c.mode !== "insensitive" || typeof c.equals !== "string") {
          unknownKey("inspectionNumber", JSON.stringify(c));
        }
        if (row.inspectionNumber.toLowerCase() !== c.equals.toLowerCase()) {
          return false;
        }
        break;
      }
      case "user": {
        const c = cond as Row;
        if (Object.keys(c).some((k) => k !== "organizationId")) {
          unknownKey("user", Object.keys(c).join(","));
        }
        const owner = state.users.find((u) => u.id === row.userId);
        if (!owner || owner.organizationId !== c.organizationId) return false;
        break;
      }
      case "workspace": {
        const some = (cond as Row).members?.some as Row | undefined;
        if (!some) unknownKey("workspace", JSON.stringify(cond));
        const hit = state.workspaceMembers.some(
          (m) =>
            m.workspaceId === row.workspaceId &&
            row.workspaceId != null &&
            m.userId === some.userId &&
            m.status === some.status,
        );
        if (!hit) return false;
        break;
      }
      default:
        unknownKey("inspection", key);
    }
  }
  return true;
}

function matchMessage(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    switch (key) {
      case "id":
      case "externalId":
      case "organizationId":
      case "userId":
      case "status":
        if (row[key] !== cond) return false;
        break;
      case "inspectionId":
        if (cond && typeof cond === "object") {
          if (!("not" in cond) || (cond as Row).not !== null) {
            unknownKey("inspectionId", JSON.stringify(cond));
          }
          if (row.inspectionId === null) return false;
        } else if (row.inspectionId !== cond) return false;
        break;
      case "createdAt":
        if (!matchDate(row.createdAt, cond as Row)) return false;
        break;
      default:
        unknownKey("inboundJobMessage", key);
    }
  }
  return true;
}

function matchToken(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    switch (key) {
      case "identifier":
      case "token":
        if (row[key] !== cond) return false;
        break;
      case "expires":
        if (!matchDate(row.expires, cond as Row)) return false;
        break;
      default:
        unknownKey("verificationToken", key);
    }
  }
  return true;
}

function byOrder(rows: Row[], orderBy?: Row): Row[] {
  if (!orderBy) return rows;
  const [[field, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const d = a[field].getTime() - b[field].getTime();
    return dir === "desc" ? -d : d;
  });
}

function uniqueViolation(): Error {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

export const fakePrisma: any = {
  user: {
    async findUnique({ where, select }: Row) {
      const u = state.users.find((x) => x.id === where.id);
      return u ? pick(u, select) : null;
    },
  },
  inspection: {
    async findFirst({ where, select }: Row) {
      const hit = state.inspections.find((r) => matchInspection(r, where));
      return hit ? pick(hit, select) : null;
    },
    async findMany({ where, orderBy, take, select }: Row) {
      if (typeof take !== "number") throw new Error("fake-prisma: findMany needs take");
      return byOrder(
        state.inspections.filter((r) => matchInspection(r, where)),
        orderBy,
      )
        .slice(0, take)
        .map((r) => pick(r, select));
    },
    async updateMany({ where, data }: Row) {
      const hits = state.inspections.filter((r) => matchInspection(r, where));
      for (const h of hits) Object.assign(h, data);
      return { count: hits.length };
    },
  },
  inboundJobMessage: {
    async findUnique({ where, select }: Row) {
      const keys = Object.keys(where);
      if (keys.length !== 1 || keys[0] !== "externalId") {
        unknownKey("inboundJobMessage.findUnique", keys.join(","));
      }
      const hit = state.messages.find((m) => m.externalId === where.externalId);
      return hit ? pick(hit, select) : null;
    },
    async create({ data, select }: Row) {
      if (state.messages.some((m) => m.externalId === data.externalId)) {
        throw uniqueViolation();
      }
      const now = tick();
      const row = {
        id: `msg_${++seq}`,
        inspectionId: null,
        parsed: null,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      state.messages.push(row);
      return pick(row, select);
    },
    async findFirst({ where, orderBy, select }: Row) {
      const hit = byOrder(
        state.messages.filter((m) => matchMessage(m, where)),
        orderBy,
      )[0];
      return hit ? pick(hit, select) : null;
    },
    async updateMany({ where, data }: Row) {
      const hits = state.messages.filter((m) => matchMessage(m, where));
      for (const h of hits) Object.assign(h, data);
      return { count: hits.length };
    },
  },
  messagingIdentity: {
    async findUnique({ where, select }: Row) {
      const { channel, address } = where.channel_address;
      const hit = state.identities.find(
        (i) => i.channel === channel && i.address === address,
      );
      return hit ? pick(hit, select) : null;
    },
    async upsert({ where, create, update, select }: Row) {
      const { channel, address } = where.channel_address;
      let hit = state.identities.find(
        (i) => i.channel === channel && i.address === address,
      );
      if (hit) Object.assign(hit, update);
      else {
        hit = { id: `mid_${++seq}`, ...create };
        state.identities.push(hit);
      }
      return pick(hit, select);
    },
  },
  verificationToken: {
    async findUnique({ where, select }: Row) {
      const hit = state.tokens.find((t) => t.token === where.token);
      return hit ? pick(hit, select) : null;
    },
    async deleteMany({ where }: Row) {
      const before = state.tokens.length;
      const keep = state.tokens.filter((t) => !matchToken(t, where));
      state.tokens.length = 0;
      state.tokens.push(...keep);
      return { count: before - keep.length };
    },
    async create({ data }: Row) {
      if (state.tokens.some((t) => t.token === data.token)) throw uniqueViolation();
      state.tokens.push({ ...data });
      return { ...data };
    },
  },
  voiceCopilotSession: {
    async create({ data, select }: Row) {
      state.sessions.push({ ...data });
      return pick(data, select);
    },
  },
  voiceCopilotObservation: {
    async create({ data, select }: Row) {
      state.observations.push({ ...data });
      return pick(data, select);
    },
  },
  async $transaction(arg: any) {
    if (typeof arg === "function") return arg(fakePrisma);
    return Promise.all(arg);
  },
};
