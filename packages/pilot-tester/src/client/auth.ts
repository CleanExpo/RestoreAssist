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

export interface UserPoolEntry {
  email: string;
  password: string;
  workspaceName: string;
  /** Matches a key in src/companies/fixtures.ts. */
  companyKey: string;
}

export interface AuthenticatedSession {
  entry: UserPoolEntry;
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
      typeof e?.companyKey !== "string"
    ) {
      throw new Error(
        `User pool entry malformed: ${JSON.stringify(e)} — expected { email, password, workspaceName, companyKey }`,
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
  return parsed as UserPoolEntry[];
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
  const session = (await probe.json()) as { user?: { id?: string } };
  if (!session?.user?.id) {
    throw new Error(
      `[pilot-tester auth] login failed for ${opts.entry.email} — session probe returned no user.id`,
    );
  }

  return {
    entry: opts.entry,
    cookieJar: jar,
    fetch: async (url, init) => {
      const cookie = await jar.getCookieString(url);
      const headers: Record<string, string> = {
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
        Cookie: cookie,
        "x-pilot-tester-run-id": opts.runId,
      };
      const res = await undiciFetch(url, { ...init, headers });
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
