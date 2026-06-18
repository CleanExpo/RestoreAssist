/**
 * Playwright helper — copies the Set-Cookie header from a test-helper API
 * response into the BrowserContext so `page.goto(...)` calls that follow
 * the sign-in request are authenticated.
 *
 * Why this exists: page.request shares its cookie jar with `page`/`context`,
 * so cookies from the response are normally applied automatically. However,
 * the NextAuth cookie (name: __Secure-next-auth.session-token on sandbox)
 * carries the `Secure` flag. Some Playwright versions don't persist Secure
 * cookies received over non-HTTPS transports. Explicitly calling addCookies()
 * is the reliable path regardless of environment.
 */
import type { BrowserContext, APIResponse } from "@playwright/test";

export async function applySessionCookieFromResponse(
  context: BrowserContext,
  response: APIResponse,
): Promise<void> {
  const setCookieHeader = response.headers()["set-cookie"];
  if (!setCookieHeader) return;

  const url = response.url();
  const { hostname } = new URL(url);

  // Parse the Set-Cookie header.
  // Format: name=value; Path=/; HttpOnly; SameSite=Lax; Max-Age=NNN[; Secure]
  const parts = setCookieHeader.split(";").map((p) => p.trim());
  const [nameValue, ...attributes] = parts;

  const eqIdx = nameValue.indexOf("=");
  if (eqIdx === -1) return;

  const name = nameValue.substring(0, eqIdx).trim();
  const value = nameValue.substring(eqIdx + 1).trim();

  type SameSiteOption = "Strict" | "Lax" | "None";

  const attrLower = attributes.map((a) => a.toLowerCase());
  const getAttr = (key: string): string | undefined => {
    const entry = attributes.find((a) =>
      a.toLowerCase().startsWith(key.toLowerCase()),
    );
    if (!entry) return undefined;
    const i = entry.indexOf("=");
    return i === -1 ? undefined : entry.substring(i + 1).trim();
  };

  const sameSiteRaw = getAttr("samesite")?.toLowerCase();
  const sameSite: SameSiteOption =
    sameSiteRaw === "strict"
      ? "Strict"
      : sameSiteRaw === "none"
        ? "None"
        : "Lax";

  const maxAge = getAttr("max-age");
  const expires = maxAge
    ? Math.floor(Date.now() / 1000) + parseInt(maxAge, 10)
    : undefined;

  await context.addCookies([
    {
      name,
      value,
      domain: hostname,
      path: getAttr("path") ?? "/",
      httpOnly: attrLower.includes("httponly"),
      secure: attrLower.includes("secure"),
      sameSite,
      expires,
    },
  ]);
}
