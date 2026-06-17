import type { APIResponse, BrowserContext } from "@playwright/test";

export async function applySessionCookieFromResponse(
  context: BrowserContext,
  response: APIResponse,
) {
  const setCookie = response.headers()["set-cookie"];
  if (!setCookie) {
    throw new Error("Expected sign-in helper response to include Set-Cookie");
  }

  const [cookiePair] = setCookie.split(";");
  const separatorIndex = cookiePair.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error("Malformed Set-Cookie header from sign-in helper");
  }

  const url = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  );

  await context.addCookies([
    {
      name: cookiePair.slice(0, separatorIndex),
      value: cookiePair.slice(separatorIndex + 1),
      url: url.origin,
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}
