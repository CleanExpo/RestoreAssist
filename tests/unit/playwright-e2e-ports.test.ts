/**
 * The E2E web server listens on E2E_PORT when it is set, and on 3000 when it is not (UNI-3468).
 * GitHub never sets E2E_PORT, so CI is unchanged. The release gate's local CI mirror sets it to
 * a free port, because on a shared Mac another session's dev server often holds localhost:3000
 * and Playwright then refuses to start ("http://localhost:3000 is already used").
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = ["E2E_PORT", "PLAYWRIGHT_BASE_URL", "CI"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

async function load(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  vi.resetModules();
  const config = (await import("../../config/playwright.config")).default;
  const origin = (await import("../../e2e/helpers/local-origin")).LOCAL_ORIGIN;
  return { config, origin };
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

describe("Playwright E2E port", () => {
  it("keeps localhost:3000 when E2E_PORT is not set", async () => {
    const { config, origin } = await load({});
    expect(origin).toBe("http://localhost:3000");
    expect(config.use?.baseURL).toBe("http://localhost:3000");
    const server = config.webServer as { url: string; env?: Record<string, string> };
    expect(server.url).toBe("http://localhost:3000");
    expect(server.env?.PORT).toBe("3000");
  });

  it("moves the server, base URL and local origin to E2E_PORT", async () => {
    const { config, origin } = await load({ E2E_PORT: "45001" });
    expect(origin).toBe("http://localhost:45001");
    expect(config.use?.baseURL).toBe("http://localhost:45001");
    const server = config.webServer as { url: string; env?: Record<string, string> };
    expect(server.url).toBe("http://localhost:45001");
    expect(server.env?.PORT).toBe("45001");
  });

  it("lets PLAYWRIGHT_BASE_URL win and starts no local server", async () => {
    const { config } = await load({ E2E_PORT: "45001", PLAYWRIGHT_BASE_URL: "https://restoreassist.app" });
    expect(config.use?.baseURL).toBe("https://restoreassist.app");
    expect(config.webServer).toBeUndefined();
  });
});
