/**
 * JEV route-call verdicts shared by the families. Script verdicts are final;
 * the Jev triage model never changes one.
 */
import type { JevArea } from "./record";
import type { InvokeResult, Method } from "./route-harness";
import { FIRM_A, type IdentityName } from "./world";

/**
 * Routes a signed-out caller may legitimately reach. Each entry says why. A
 * route matching one of these is still judged for leaks and crashes.
 */
export const PUBLIC_ROUTES: Array<{ re: RegExp; why: string }> = [
  { re: /^\/api\/auth(\/|$)/, why: "sign-in, sign-up and password reset" },
  { re: /^\/api\/health(\/|$)/, why: "uptime probe" },
  { re: /^\/api\/webhooks(\/|$)/, why: "provider webhooks; signature checked inside" },
  { re: /^\/api\/portal\/\[token\]/, why: "customer portal by unguessable token" },
  { re: /^\/api\/capture\/\[token\]/, why: "homeowner capture link by token" },
  // Reviewed 22/10/2026 from J1's first run; each returns no tenant data.
  { re: /^\/api\/contractors(\/reviews)?$/, why: "public contractor directory and reviews, rate limited" },
  { re: /^\/api\/inspections\/checklists$/, why: "static IICRC checklist catalogue, rate limited" },
  { re: /^\/api\/notifications\/email$/, why: "GET lists the fixed event names only" },
  { re: /^\/api\/observability\/client-error$/, why: "browser error reports from signed-out pages" },
  { re: /^\/api\/properties\/scrape\/health$/, why: "scraper health probe" },
];

/**
 * Routes whose [id] segment does not select a record: a 2xx write there is
 * not a cross-tenant write. Each entry names the line that scopes the work.
 */
export const ID_IGNORED: Array<{ re: RegExp; why: string }> = [
  { re: /^\/api\/inspections\/\[id\]\/vectorise-jobs$/, why: "scopes HistoricalJob to session.user.id (route.ts:144); [id] unused" },
];

const HONEST_503 = /degraded|unavailable|not (yet )?available|not configured/i;
const HARNESS_LIMITS =/outside a request scope|timeout \d+ms|JevNetworkBlocked/;

export function isPublic(route: string): boolean {
  return PUBLIC_ROUTES.some((p) => p.re.test(route));
}

export function areaOf(route: string): JevArea {
  if (/invoice|billing|stripe|checkout|subscription|payment|xero|credits|pricing|gst|revenue|lifetime/.test(route)) return "payments";
  if (/upload|photo|media|image|cloudinary|storage|video|vision|evidence/.test(route)) return "photos";
  if (/floor-plan|sketch|propert|underlay|roomplan|lidar/.test(route)) return "floorplans";
  if (/client|contact|crm|messag|email|team|invite|contractor|notification|portal|support|feedback/.test(route)) return "crm";
  if (/inspection|report|claim|scope|estimate|\/v1\/|moisture|reading|swms|whs|authoris|form|restoration|job/.test(route)) return "flow";
  return "security";
}

export interface Verdict {
  state: "PASS" | "FAIL" | "INCONCLUSIVE";
  detail: string;
}

export function judgeCall(args: {
  who: IdentityName;
  route: string;
  method: Method;
  touchesA: boolean;
  payload: string;
  res: InvokeResult;
  markA: string;
  blocked: string[];
}): Verdict {
  const { who, route, method, touchesA, payload, res, markA, blocked } = args;
  const outsider = !FIRM_A.includes(who);
  if (outsider && res.text.includes(markA)) return { state: "FAIL", detail: `leak: firm A data returned to ${who} (status ${res.status})` };
  if (res.status === null) {
    if (blocked.length) return { state: "INCONCLUSIVE", detail: `needs provider ${blocked.join(",")}: ${res.error}` };
    const err = res.error ?? "no status";
    // An uncaught throw is what Next turns into a 500 for the user. Only the
    // harness's own limits (no request scope, timeout, import failure) stay open.
    if (err.startsWith("handler:") && !HARNESS_LIMITS.test(err)) return { state: "FAIL", detail: `unhandled exception (500 in production) on ${payload} payload: ${err.slice(9, 160)}` };
    return { state: "INCONCLUSIVE", detail: err };
  }
  const s = res.status;
  const ok = s >= 200 && s < 300;
  if (who === "anon" && ok && !isPublic(route)) return { state: "FAIL", detail: `signed-out caller got ${s}` };
  if (outsider && who !== "anon" && ok && touchesA && method !== "GET" && !ID_IGNORED.some((p) => p.re.test(route))) {
    return { state: "FAIL", detail: `${who} write on firm A record accepted (${s})` };
  }
  if (s >= 500) {
    if (blocked.length) return { state: "INCONCLUSIVE", detail: `${s} after refused call to ${blocked.join(",")}` };
    // A 503 that says what is unavailable is honest status, not a crash.
    if (s === 503 && HONEST_503.test(res.text)) return { state: "PASS", detail: `honest 503: ${res.text.slice(0, 80)}` };
    return { state: "FAIL", detail: `server error ${s} on ${payload} payload: ${res.text.replace(/\s+/g, " ").slice(0, 120)}` };
  }
  return { state: "PASS", detail: String(s) };
}
