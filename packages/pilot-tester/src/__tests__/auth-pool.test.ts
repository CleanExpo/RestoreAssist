/**
 * RA-7008 — identity containment on the shared database.
 *
 * With no separate sandbox DB (founder decision 2026-07-09), the harness's
 * safety boundary is WHO it can authenticate as. loadUserPool must refuse any
 * pool containing a non-synthetic identity, so the swarm can never hold a
 * real user's credentials.
 */

import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { validateCsrf } from "@/lib/csrf";
import {
  assertSessionIdentity,
  canonicalOriginForBaseUrl,
  loadUserPool,
  PILOT_SANDBOX_MARKER,
  withCanonicalMutationOrigin,
} from "../client/auth.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";

const tmpFiles: string[] = [];

async function poolFile(entries: unknown): Promise<string> {
  const p = path.join(
    os.tmpdir(),
    `pilot-pool-${Math.random().toString(36).slice(2)}.json`,
  );
  await fs.writeFile(p, JSON.stringify(entries));
  tmpFiles.push(p);
  return p;
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((p) => fs.rm(p, { force: true })));
});

const validEntry = {
  email: "pilot-beyond-clean@restoreassist.sandbox",
  password: "x".repeat(24),
  workspaceName: "Beyond Clean — Sunshine Coast (sandbox pilot)",
  workspaceId: "workspace_beyond_clean",
  companyKey: "beyond-clean",
};

const validPool = SYNTHETIC_COMPANIES.map((company, index) => ({
  email: `pilot-${company.key}@restoreassist.sandbox`,
  password: `sandbox-password-${index}`,
  workspaceName: `${company.name} (sandbox pilot)`,
  workspaceId: `workspace_${company.key.replaceAll("-", "_")}`,
  companyKey: company.key,
}));

describe("loadUserPool identity containment", () => {
  it("accepts a pool of synthetic pilot identities", async () => {
    const p = await poolFile(validPool);
    await expect(loadUserPool(p)).resolves.toHaveLength(SYNTHETIC_COMPANIES.length);
  });

  it("refuses an entry with a real-looking email (wrong domain)", async () => {
    const p = await poolFile([
      ...validPool.slice(1),
      { ...validEntry, email: "phill@restoreassist.com.au" },
    ]);
    await expect(loadUserPool(p)).rejects.toThrow(/not a synthetic pilot/);
  });

  it("refuses an entry without the pilot- prefix even on the sandbox domain", async () => {
    const p = await poolFile([
      ...validPool.slice(1),
      { ...validEntry, email: "admin@restoreassist.sandbox" },
    ]);
    await expect(loadUserPool(p)).rejects.toThrow(/not a synthetic pilot/);
  });

  it("never echoes the password when refusing an entry", async () => {
    const p = await poolFile([
      ...validPool.slice(1),
      { ...validEntry, email: "someone@gmail.com", password: "SUPERSECRET-99" },
    ]);
    await expect(loadUserPool(p)).rejects.toThrow(
      expect.not.objectContaining({ message: expect.stringContaining("SUPERSECRET-99") }),
    );
  });

  it("still rejects structurally malformed entries", async () => {
    const p = await poolFile([{ email: "pilot-x@restoreassist.sandbox" }]);
    await expect(loadUserPool(p)).rejects.toThrow(/malformed/);
  });

  it("rejects a partial pool or one email masquerading as multiple companies", async () => {
    const partial = await poolFile([validEntry]);
    await expect(loadUserPool(partial)).rejects.toThrow(/exactly one identity/);

    const reused = await poolFile(
      validPool.map((entry) => ({ ...entry, email: validPool[0].email })),
    );
    await expect(loadUserPool(reused)).rejects.toThrow(/must use|unique/);
  });

  it("binds the authenticated email and READY workspace to the pool entry", () => {
    expect(
      assertSessionIdentity(
        validEntry,
        { user: { id: "user_1", email: validEntry.email } },
        { hasWorkspace: true, ready: true, status: "READY", workspaceId: validEntry.workspaceId, workspaceName: validEntry.workspaceName, sandboxMarker: PILOT_SANDBOX_MARKER },
      ),
    ).toEqual({ userId: "user_1", workspaceId: validEntry.workspaceId });

    expect(() =>
      assertSessionIdentity(
        validEntry,
        { user: { id: "user_1", email: "pilot-other@restoreassist.sandbox" } },
        { hasWorkspace: true, ready: true, status: "READY", workspaceId: validEntry.workspaceId, workspaceName: validEntry.workspaceName, sandboxMarker: PILOT_SANDBOX_MARKER },
      ),
    ).toThrow(/session identity/);

    expect(() =>
      assertSessionIdentity(
        validEntry,
        { user: { id: "user_1", email: validEntry.email } },
        { hasWorkspace: true, ready: true, status: "READY", workspaceId: "workspace_other", workspaceName: validEntry.workspaceName, sandboxMarker: PILOT_SANDBOX_MARKER },
      ),
    ).toThrow(/workspace identity/);

    expect(() =>
      assertSessionIdentity(
        validEntry,
        { user: { id: "user_1", email: validEntry.email } },
        { hasWorkspace: true, ready: true, status: "READY", workspaceId: validEntry.workspaceId, workspaceName: "Real customer", sandboxMarker: PILOT_SANDBOX_MARKER },
      ),
    ).toThrow(/workspace identity/);

    expect(() =>
      assertSessionIdentity(
        validEntry,
        { user: { id: "user_1", email: validEntry.email } },
        { hasWorkspace: true, ready: true, status: "READY", workspaceId: validEntry.workspaceId, workspaceName: validEntry.workspaceName },
      ),
    ).toThrow(/workspace identity/);
  });
});

describe("session mutation Origin contract", () => {
  it("derives the canonical Origin from baseUrl and passes strict validateCsrf", () => {
    const init = withCanonicalMutationOrigin(
      "https://canary.restoreassist.example/base-path",
      "https://canary.restoreassist.example/api/pilot-tester/judge",
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Origin: "https://canary.restoreassist.example",
    });

    const request = new NextRequest("https://canary.restoreassist.example/api/pilot-tester/judge", {
      method: "POST",
      headers: { ...init.headers, host: "canary.restoreassist.example" },
      body: "{}",
    });
    expect(validateCsrf(request, { requireOrigin: true })).toBeNull();
  });

  it("does not invent Origin on reads", () => {
    const init = withCanonicalMutationOrigin(
      "https://canary.restoreassist.example",
      "https://canary.restoreassist.example/api/workspace/status",
      { method: "GET", headers: { Accept: "application/json" } },
    );
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("fails closed on cross-origin mutation URL/base mismatch", () => {
    expect(() =>
      withCanonicalMutationOrigin(
        "https://canary.restoreassist.example",
        "https://evil.example/api/pilot-tester/judge",
        { method: "POST" },
      ),
    ).toThrow(/refusing cross-origin mutation/);
  });

  it("fails closed when a caller supplies a hostile Origin", () => {
    expect(() =>
      withCanonicalMutationOrigin(
        "https://canary.restoreassist.example",
        "https://canary.restoreassist.example/api/pilot-tester/judge",
        { method: "POST", headers: { Origin: "https://evil.example" } },
      ),
    ).toThrow(/non-canonical Origin/);
  });

  it("normalises baseUrl to the URL origin only", () => {
    expect(canonicalOriginForBaseUrl("https://canary.restoreassist.example/some/path")).toBe(
      "https://canary.restoreassist.example",
    );
  });
});
