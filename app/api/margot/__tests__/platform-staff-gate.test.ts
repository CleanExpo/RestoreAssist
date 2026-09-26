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

type Handler = (req: NextRequest) => Promise<Response>;

const ROUTES: Array<[string, "GET" | "POST", () => Promise<Record<string, unknown>>]> = [
  ["margot/telegram/recent", "GET", () => import("../telegram/recent/route")],
  ["margot/linear/top", "GET", () => import("../linear/top/route")],
  ["margot/chat", "POST", () => import("../chat/route")],
  ["margot/corpus/status", "GET", () => import("../corpus/status/route")],
  ["margot/health", "GET", () => import("../health/route")],
  ["margot/hermes-proxy", "POST", () => import("../hermes-proxy/route")],
  ["margot/schedules", "GET", () => import("../schedules/route")],
  ["margot/social-relevance", "POST", () => import("../social-relevance/route")],
  ["mission-control/context", "GET", () => import("../../mission-control/context/route")],
  ["admin/rag/ingest", "POST", () => import("../../admin/rag/ingest/route")],
  ["admin/rag/probe", "GET", () => import("../../admin/rag/probe/route")],
  ["admin/rag/status", "GET", () => import("../../admin/rag/status/route")],
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

async function call(path: string, method: "GET" | "POST", load: () => Promise<Record<string, unknown>>) {
  const mod = await load();
  const handler = mod[method] as Handler;
  try {
    return await handler(request(path, method));
  } catch {
    return null;
  }
}

describe("founder / platform routes refuse a tenant ADMIN", () => {
  it.each(ROUTES)("%s (%s) returns 403 and touches nothing", async (path, method, load) => {
    const res = await call(path, method, load);
    expect(res?.status).toBe(403);
    expect(downstream).toEqual([]);
  });
});

describe("positive control: the allowlisted caller gets past the gate", () => {
  it.each(ROUTES)("%s (%s) is not refused for platform staff", async (path, method, load) => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", `x, ${TENANT_ADMIN}`);
    const res = await call(path, method, load);
    expect(res === null || res.status !== 403 || downstream.length > 0).toBe(true);
  });
});
