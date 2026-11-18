import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * /forgot-password is a client page, so its title has to come from a sibling
 * layout. Without one it falls back to the site default title instead of
 * "Forgot password | RestoreAssist" (the root layout's `%s | RestoreAssist`
 * template), unlike /login which sets "Sign in".
 */
async function layoutMetadata(route: string) {
  const file = join(process.cwd(), "app", route, "layout.tsx");
  expect(existsSync(file), `app/${route}/layout.tsx exists`).toBe(true);
  const mod = await import(pathToFileURL(file).href);
  return mod.metadata as { title?: unknown; robots?: unknown };
}

describe("auth page titles", () => {
  it("/login sets its own title", async () => {
    expect((await layoutMetadata("login")).title).toBe("Sign in");
  });

  it("/forgot-password sets its own title, matching /login", async () => {
    const meta = await layoutMetadata("forgot-password");
    expect(meta.title).toBe("Forgot password");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
