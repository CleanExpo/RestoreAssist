/**
 * Founder / platform surfaces must be platform-staff gated.
 *
 * `role: "ADMIN"` is every self-registered owner (register, google-signin and
 * native-token-exchange all create ADMIN). These routes were gated by
 * verifyAdminFromDb alone, so any firm that signed up could read the
 * founder's Telegram log, Linear issues and Nexus context, and could call
 * Margot chat and RAG ingest on platform keys. Same fail-closed allowlist as
 * RA-7592 / RA-7594 (`PLATFORM_SUPPORT_USER_IDS` /
 * verifyPlatformSupportOperator).
 *
 * CLEAR bar: a tenant ADMIN gets 403 and nothing downstream is touched
 * (no Supabase client, no outbound fetch, no Prisma model beyond the
 * role re-check). Positive control: the same caller on the allowlist gets
 * past the gate, so the refusal is the allowlist and not a mock artefact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TENANT_ADMIN = "tenant-admin-platform-gate";

const getServerSession = vi.fn();
const downstream: string[] = [];

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => {
    downstream.push("supabase");
    throw new Error("downstream reached");
  },
}));
vi.mock("@/lib/prisma", () => {
  const userFindUnique = async () => ({
    id: TENANT_ADMIN,
    role: "ADMIN",
    organizationId: "org-tenant-platform-gate",
  });
  const prisma = new Proxy(
    {},
    {
      get(_t, model: string) {
        if (model === "user") {
          return new Proxy(
            {},
            {
              get(_u, op: string) {
                if (op === "findUnique") return userFindUnique;
                downstream.push(`prisma.user.${op}`);
                return () => {
                  throw new Error("downstream reached");
                };
              },
            },
          );
        }
        downstream.push(`prisma.${String(model)}`);
        return new Proxy(
          {},
          {
            get() {
              return () => {
                throw new Error("downstream reached");
              };
            },
          },
        );
      },
    },
  );
  return { prisma, default: prisma };
});

import * as telegramRecent from "../telegram/recent/route";
import * as linearTop from "../linear/top/route";
import * as chat from "../chat/route";
import * as corpusStatus from "../corpus/status/route";
import * as health from "../health/route";
import * as hermesProxy from "../hermes-proxy/route";
import * as schedules from "../schedules/route";
import * as socialRelevance from "../social-relevance/route";
import * as missionControlContext from "../../mission-control/context/route";
import * as ragIngest from "../../admin/rag/ingest/route";
import * as ragProbe from "../../admin/rag/probe/route";
import * as ragStatus from "../../admin/rag/status/route";

type Handler = (req: NextRequest) => Promise<Response>;
type RouteModule = Record<string, unknown>;

// Static imports: vi.mock is hoisted above them, so every route binds to
// this file's mocks and never to a module instance another file created.
const ROUTES: Array<[string, "GET" | "POST", RouteModule]> = [
  ["margot/telegram/recent", "GET", telegramRecent],
  ["margot/linear/top", "GET", linearTop],
  ["margot/chat", "POST", chat],
  ["margot/corpus/status", "GET", corpusStatus],
  ["margot/health", "GET", health],
  ["margot/hermes-proxy", "POST", hermesProxy],
  ["margot/schedules", "GET", schedules],
  ["margot/social-relevance", "POST", socialRelevance],
  ["mission-control/context", "GET", missionControlContext],
  ["admin/rag/ingest", "POST", ragIngest],
  ["admin/rag/probe", "GET", ragProbe],
  ["admin/rag/status", "GET", ragStatus],
];

function request(path: string, method: "GET" | "POST") {
  const url = `http://localhost/api/${path}?q=probe`;
  return method === "GET"
    ? new NextRequest(url)
    : new NextRequest(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "probe" }],
          text: "probe",
          query: "probe",
        }),
      });
}

const fetchSpy = vi.fn(async () => {
  downstream.push("fetch");
  throw new Error("downstream reached");
});

beforeEach(() => {
  downstream.length = 0;
  getServerSession.mockReset();
  getServerSession.mockResolvedValue({
    user: { id: TENANT_ADMIN, role: "ADMIN" },
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "some-other-staff-id");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function call(path: string, method: "GET" | "POST", mod: RouteModule) {
  const handler = mod[method] as Handler;
  try {
    return await handler(request(path, method));
  } catch {
    return null;
  }
}

describe("founder / platform routes refuse a tenant ADMIN", () => {
  it.each(ROUTES)("%s (%s) returns 403 and touches nothing", async (path, method, mod) => {
    const res = await call(path, method, mod);
    const seen = {
      status: res?.status,
      body: res ? await res.clone().text() : null,
      downstream: [...downstream],
      allowlist: process.env.PLATFORM_SUPPORT_USER_IDS,
    };
    expect(seen).toMatchObject({ status: 403, downstream: [] });
  });
});

describe("positive control: the allowlisted caller gets past the gate", () => {
  it.each(ROUTES)("%s (%s) is not refused for platform staff", async (path, method, mod) => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", `x, ${TENANT_ADMIN}`);
    const res = await call(path, method, mod);
    expect(res === null || res.status !== 403 || downstream.length > 0).toBe(true);
  });
});
