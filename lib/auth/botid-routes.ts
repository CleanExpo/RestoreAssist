/**
 * RA-8418 — the one owner of the BotID browser protect list.
 *
 * BotID has two halves that must agree. A route handler calls `verifyBotId()`
 * (lib/auth/botid.ts), and the browser script mounted by `<BotIdClient>` in
 * app/layout.tsx attaches the proof headers only to requests whose path and
 * method match an entry here. A route that runs the server check but is missing
 * from this list is refused for every real person once the check is enforced.
 *
 * lib/auth/__tests__/botid-routes.test.ts discovers every `route.ts` that calls
 * `verifyBotId(` and fails when this list does not cover it, so add the entry
 * here in the same change that adds the server call.
 *
 * Plain data only: this module is imported by the root layout.
 */
export interface BotIdProtectedRoute {
  /** URL path. `*` matches any run of characters, including `/`. */
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

export const BOTID_PROTECTED_ROUTES: readonly BotIdProtectedRoute[] = [
  { path: "/api/auth/register", method: "POST" },
  { path: "/api/auth/forgot-password", method: "POST" },
  { path: "/api/auth/reset-password", method: "POST" },
  // Public token-gated writes (server check added 2026-06-11, RA-8418).
  { path: "/api/authority-forms/sign/*", method: "POST" },
  { path: "/api/capture/*/sketch", method: "POST" },
  { path: "/api/portal/*/evidence", method: "POST" },
];

/**
 * The same path matcher the botid client uses (botid 1.5.11,
 * dist/client/index.mjs):
 *   y=a=>{let e=a.replace(/[.?+^$[\]\\(){}|-]/g,"\\$&").split("*").join(".*");return new RegExp(`^${e}$`)}
 * The unit test reads the installed package and fails if that source changes.
 */
export function botIdPathPattern(path: string): RegExp {
  const escaped = path
    .replace(/[.?+^$[\]\\(){}|-]/g, "\\$&")
    .split("*")
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

/** True when the browser script would attach BotID headers to this request. */
export function isBotIdProtected(
  pathname: string,
  method: string,
  routes: readonly BotIdProtectedRoute[] = BOTID_PROTECTED_ROUTES,
): boolean {
  return routes.some(
    (route) =>
      pathname.search(botIdPathPattern(route.path)) !== -1 &&
      route.method.toLowerCase() === method.toLowerCase(),
  );
}
