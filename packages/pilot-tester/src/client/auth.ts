/**
 * Auth-cookie pool.
 *
 * NextAuth uses a session cookie. We don't have a service-account /
 * API-key path (RA-1727 is intentionally limited to V1.1; an API-key
 * surface is V1.2 work). To drive the harness headlessly we replicate
 * the e2e/auth.setup.ts trick: log each synthetic owner in once via
 * a real form POST, capture the Set-Cookie, and reuse it for every
 * subsequent request as that user.
 *
 * No browser is involved at runtime — we use undici's Cookie support
 * directly. (Playwright is reserved for the V1 smoke; here we want
 * a 5-second cold start, not a 30-second browser launch.)
 */

import { CookieJar } from "tough-cookie";
import { fetch as undiciFetch, type RequestInit } from "undici";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";

export interface UserPoolEntry {
  email: string;
  password: string;
  workspaceName: string;
  /** Exact READY sandbox workspace returned by /api/workspace/status. */
  workspaceId: string;
  /** Matches a key in src/companies/fixtures.ts. */
  companyKey: string;
}

export interface AuthenticatedSession {
  entry: UserPoolEntry;
  userId: string;
  workspaceId: string;
  cookieJar: CookieJar;
  /** A fetch bound to this session — automatically attaches cookies. */
  fetch: (
    url: string,
    init?: RequestInit & { headers?: Record<string, string> },
  ) => ReturnType<typeof undiciFetch>;
}

/**
 * RA-7008 identity containment: on the shared database the harness's safety
 * boundary is WHO it can act as, not which DB it points at. Every pool entry
 * must be a synthetic pilot identity — the harness refuses to load a pool
 * containing anything that could be a real user's account.
 */
const PILOT_EMAIL_PATTERN = /^pilot-[a-z0-9-]+@restoreassist\.sandbox$/;
export const PILOT_SANDBOX_MARKER = "RESTOREASSIST_PILOT_SANDBOX_V1";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function expectedWorkspaceName(companyName: string): string {
  return `${companyName} (sandbox pilot)`;
}

export function assertExactUserPool(pool: UserPoolEntry[]): void {
  const expectedKeys = new Set(SYNTHETIC_COMPANIES.map((company) => company.key));
  const companyKeys = pool.map((entry) => entry.companyKey);
  const emails = pool.map((entry) => entry.email);
  const workspaceNames = pool.map((entry) => entry.workspaceName);
  const workspaceIds = pool.map((entry) => entry.workspaceId);
  if (
    pool.length !== expectedKeys.size ||
    new Set(companyKeys).size !== pool.length ||
    companyKeys.some((key) => !expectedKeys.has(key))
  ) {
    throw new Error(
      `User pool must contain exactly one identity for each canonical company: ${[...expectedKeys].join(", ")}`,
    );
  }
  if (
    new Set(emails).size !== pool.length ||
    new Set(workspaceNames).size !== pool.length ||
    new Set(workspaceIds).size !== pool.length
  ) {
    throw new Error("User pool email, workspaceName, and workspaceId values must be unique");
  }

  for (const entry of pool) {
    const company = SYNTHETIC_COMPANIES.find((candidate) => candidate.key === entry.companyKey)!;
    const expectedEmail = `pilot-${company.key}@restoreassist.sandbox`;
    const expectedName = expectedWorkspaceName(company.name);
    if (entry.email !== expectedEmail || entry.workspaceName !== expectedName) {
      throw new Error(
        `User pool identity for ${entry.companyKey} must use ${expectedEmail} and the canonical sandbox workspace name`,
      );
    }
    if (!/^[-A-Za-z0-9_]{6,128}$/.test(entry.workspaceId)) {
      throw new Error(`User pool workspaceId for ${entry.companyKey} is absent or malformed`);
    }
    if (entry.password.length < 16) {
      throw new Error(`User pool password for ${entry.companyKey} is too short`);
    }
  }
}

export async function loadUserPool(filePath: string): Promise<UserPoolEntry[]> {
  const abs = path.resolve(filePath);
  const raw = await fs.readFile(abs, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`User pool at ${abs} is not a JSON array`);
  }
  for (const e of parsed) {
    if (
      typeof e?.email !== "string" ||
      typeof e?.password !== "string" ||
      typeof e?.workspaceName !== "string" ||
      typeof e?.workspaceId !== "string" ||
      typeof e?.companyKey !== "string"
    ) {
      throw new Error(
        `User pool entry malformed — expected { email, password, workspaceName, workspaceId, companyKey }`,
      );
    }
    if (!PILOT_EMAIL_PATTERN.test(e.email)) {
      // Don't echo the password — the entry may be a real credential pasted
      // by mistake, which is exactly the case this guard exists for.
      throw new Error(
        `User pool entry refused: "${e.email}" is not a synthetic pilot ` +
          `identity (expected pilot-<companyKey>@restoreassist.sandbox). ` +
          `The swarm must never hold credentials for a real account.`,
      );
    }
  }
  const pool = parsed as UserPoolEntry[];
  assertExactUserPool(pool);
  return pool;
}

export function assertSessionIdentity(
  entry: UserPoolEntry,
  session: { user?: { id?: string; email?: string | null } },
  workspace: {
    hasWorkspace?: boolean;
    status?: string | null;
    workspaceId?: string | null;
    ready?: boolean;
    workspaceName?: string | null;
    sandboxMarker?: string | null;
  },
): { userId: string; workspaceId: string } {
  if (
    typeof session.user?.id !== "string" ||
    session.user.id.length === 0 ||
    session.user.email?.toLowerCase() !== entry.email
  ) {
    throw new Error(
      `[pilot-tester auth] session identity does not match ${entry.email}`,
    );
  }
  if (
    workspace.hasWorkspace !== true ||
    workspace.ready !== true ||
    workspace.status !== "READY" ||
    workspace.workspaceId !== entry.workspaceId ||
    workspace.workspaceName !== entry.workspaceName ||
    workspace.sandboxMarker !== PILOT_SANDBOX_MARKER
  ) {
    throw new Error(
      `[pilot-tester auth] READY workspace identity does not match the expected sandbox workspace for ${entry.companyKey}`,
    );
  }
  return { userId: session.user.id, workspaceId: entry.workspaceId };
}

export function canonicalOriginForBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("[pilot-tester auth] baseUrl must be an absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("[pilot-tester auth] baseUrl must use http or https");
  }
  return url.origin;
}

export function withCanonicalMutationOrigin(
  baseUrl: string,
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): RequestInit & { headers?: Record<string, string> } {
  const method = String(init?.method ?? "GET").toUpperCase();
  if (!MUTATION_METHODS.has(method)) return init ?? {};

  const expectedOrigin = canonicalOriginForBaseUrl(baseUrl);
  let requestUrl: URL;
  try {
    requestUrl = new URL(url);
  } catch {
    throw new Error("[pilot-tester auth] mutation URL must be absolute");
  }
  if (requestUrl.origin !== expectedOrigin) {
    throw new Error(
      `[pilot-tester auth] refusing cross-origin mutation: ${requestUrl.origin} does not match ${expectedOrigin}`,
    );
  }

  const headers = { ...((init?.headers as Record<string, string> | undefined) ?? {}) };
  const suppliedOriginKey = Object.keys(headers).find((key) => key.toLowerCase() === "origin");
  if (suppliedOriginKey && headers[suppliedOriginKey] !== expectedOrigin) {
    throw new Error("[pilot-tester auth] refusing mutation with non-canonical Origin");
  }
  if (suppliedOriginKey && suppliedOriginKey !== "Origin") {
    delete headers[suppliedOriginKey];
  }
  headers.Origin = expectedOrigin;
  return { ...(init ?? {}), headers };
}

interface LoginOptions {
  baseUrl: string;
  entry: UserPoolEntry;
  /** Run-id for log correlation. Sent as x-pilot-tester-run-id. */
  runId: string;
}

/**
 * Bootstrap a session by POSTing the credentials to NextAuth's
 * credentials provider. Returns a cookie jar carrying the resulting
 * session cookie + a fetch helper bound to that jar.
 */
export async function bootstrapSession(
  opts: LoginOptions,
): Promise<AuthenticatedSession> {
  const jar = new CookieJar();

  const csrfRes = await undiciFetch(`${opts.baseUrl}/api/auth/csrf`, {
    headers: { "x-pilot-tester-run-id": opts.runId },
  });
  if (!csrfRes.ok) {
    throw new Error(
      `[pilot-tester auth] CSRF fetch failed: ${csrfRes.status} ${csrfRes.statusText}`,
    );
  }
  await captureSetCookies(
    csrfRes.headers as unknown as Headers,
    jar,
    opts.baseUrl,
  );
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const body = new URLSearchParams({
    email: opts.entry.email,
    password: opts.entry.password,
    csrfToken,
    callbackUrl: `${opts.baseUrl}/dashboard`,
    json: "true",
  });

  const cookieHeader = await jar.getCookieString(opts.baseUrl);
  const loginRes = await undiciFetch(
    `${opts.baseUrl}/api/auth/callback/credentials`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "x-pilot-tester-run-id": opts.runId,
      },
      body: body.toString(),
      redirect: "manual",
    },
  );
  await captureSetCookies(
    loginRes.headers as unknown as Headers,
    jar,
    opts.baseUrl,
  );

  // NextAuth returns 302 → /dashboard on success, 200 with error JSON
  // on failure. Sanity-check by hitting a known authenticated endpoint.
  const sessionCookie = await jar.getCookieString(opts.baseUrl);
  const probe = await undiciFetch(`${opts.baseUrl}/api/auth/session`, {
    headers: { Cookie: sessionCookie, "x-pilot-tester-run-id": opts.runId },
  });
  if (!probe.ok) {
    throw new Error(
      `[pilot-tester auth] session probe failed for ${opts.entry.email}: ${probe.status}`,
    );
  }
  const session = (await probe.json()) as {
    user?: { id?: string; email?: string | null };
  };

  const workspaceProbe = await undiciFetch(`${opts.baseUrl}/api/workspace/status`, {
    headers: { Cookie: sessionCookie, "x-pilot-tester-run-id": opts.runId },
  });
  if (!workspaceProbe.ok) {
    throw new Error(
      `[pilot-tester auth] workspace probe failed for ${opts.entry.email}: ${workspaceProbe.status}`,
    );
  }
  const workspace = (await workspaceProbe.json()) as {
    hasWorkspace?: boolean;
    status?: string | null;
    workspaceId?: string | null;
    ready?: boolean;
    workspaceName?: string | null;
    sandboxMarker?: string | null;
  };
  const identity = assertSessionIdentity(opts.entry, session, workspace);

  return {
    entry: opts.entry,
    ...identity,
    cookieJar: jar,
    fetch: async (url, init) => {
      const sameOriginInit = withCanonicalMutationOrigin(opts.baseUrl, url, init);
      const cookie = await jar.getCookieString(url);
      const headers: Record<string, string> = {
        ...((sameOriginInit.headers as Record<string, string> | undefined) ?? {}),
        Cookie: cookie,
        "x-pilot-tester-run-id": opts.runId,
      };
      const res = await undiciFetch(url, { ...sameOriginInit, headers });
      await captureSetCookies(res.headers as unknown as Headers, jar, url);
      return res;
    },
  };
}

async function captureSetCookies(
  headers: Headers,
  jar: CookieJar,
  url: string,
): Promise<void> {
  // Headers object exposes raw set-cookie via getSetCookie() in undici v6+.
  const anyHeaders = headers as unknown as {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };
  let cookies: string[] = [];
  if (typeof anyHeaders.getSetCookie === "function") {
    cookies = anyHeaders.getSetCookie();
  } else if (typeof anyHeaders.raw === "function") {
    const raw = anyHeaders.raw();
    cookies = raw["set-cookie"] ?? [];
  } else {
    const single = headers.get("set-cookie");
    if (single) cookies = [single];
  }
  for (const c of cookies) {
    await jar.setCookie(c, url).catch(() => {
      /* ignore individual cookie parse failures */
    });
  }
}
