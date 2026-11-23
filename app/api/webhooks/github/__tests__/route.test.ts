/**
 * RA-8607 — GitHub push webhook that feeds the "What's New" popup.
 *
 * Before this fix the release was keyed on a version worked out from the
 * constant package.json version, so only 1.0.1, 1.1.0 and 2.0.0 could ever be
 * made and every later push returned "already processed". A failed notes job
 * left "Release notes generating…" on the row, the notice linked to a query
 * parameter nothing reads, and the user fan-out stopped silently at 5000.
 */

import { existsSync } from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const SECRET = "test-github-webhook-secret";
process.env.GITHUB_WEBHOOK_SECRET = SECRET;

// ---- next/server `after`: collect background jobs so tests can await them.
const backgroundJobs: Array<() => Promise<unknown>> = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => Promise<unknown>) => {
      backgroundJobs.push(fn);
    },
  };
});

async function drainBackground() {
  while (backgroundJobs.length > 0) {
    const job = backgroundJobs.shift()!;
    await job();
  }
}

// ---- Anthropic: notes generation, switchable to failure.
const notesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => notesCreate(...a) };
  },
}));

vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: vi.fn(),
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: (
    _req: unknown,
    input: { code: string; message: string; status: number },
  ) =>
    new Response(
      JSON.stringify({ error: { code: input.code, message: input.message } }),
      { status: input.status, headers: { "Content-Type": "application/json" } },
    ),
}));

// ---- In-memory Prisma with the real unique keys on AppRelease.
type Release = {
  id: string;
  version: string;
  title: string;
  notes: string;
  commitSha: string | null;
  githubDeliveryId: string | null;
};
let releases: Release[] = [];
let users: Array<{ id: string }> = [];
let notifications: Array<{ userId: string; link: string }> = [];
let nextId = 1;

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
  });
}

function matches(row: Release, where: Record<string, unknown>) {
  return Object.entries(where).every(
    ([k, v]) => (row as Record<string, unknown>)[k] === v,
  );
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appRelease: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        releases.find((r) => matches(r, where)) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        releases.find((r) => matches(r, where)) ?? null,
      create: async ({ data }: { data: Omit<Release, "id"> }) => {
        if (releases.some((r) => r.version === data.version))
          throw uniqueViolation();
        if (
          data.githubDeliveryId &&
          releases.some((r) => r.githubDeliveryId === data.githubDeliveryId)
        )
          throw uniqueViolation();
        const row = { id: `rel_${nextId++}`, ...data } as Release;
        releases.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Release>;
      }) => {
        const row = releases.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    user: {
      findMany: async (args: {
        take?: number;
        skip?: number;
        cursor?: { id: string };
      }) => {
        const sorted = [...users].sort((a, b) => a.id.localeCompare(b.id));
        let start = 0;
        if (args.cursor) {
          start = sorted.findIndex((u) => u.id === args.cursor!.id);
        }
        start += args.skip ?? 0;
        const end = args.take === undefined ? undefined : start + args.take;
        return sorted.slice(start, end);
      },
    },
    notification: {
      createMany: async ({
        data,
      }: {
        data: Array<{ userId: string; link: string }>;
      }) => {
        notifications.push(...data);
        return { count: data.length };
      },
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "../route";
import {
  RELEASE_NOTES_FAILED,
  RELEASE_NOTES_NOT_READY,
  RELEASE_NOTICE_LINK,
} from "@/lib/releases/release-state";

function pushRequest(opts: {
  sha: string;
  deliveryId: string;
  messages?: string[];
}) {
  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: opts.sha,
    commits: (opts.messages ?? ["fix: tidy a thing"]).map((message) => ({
      message,
      author: { name: "Dev" },
    })),
  });
  const digest = createHmac("sha256", SECRET).update(body).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/github", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": `sha256=${digest}`,
      "x-github-event": "push",
      "x-github-delivery": opts.deliveryId,
    },
  });
}

beforeEach(() => {
  releases = [];
  users = [{ id: "user_a" }];
  notifications = [];
  nextId = 1;
  backgroundJobs.length = 0;
  notesCreate.mockReset();
  notesCreate.mockResolvedValue({
    content: [
      {
        type: "text",
        text: JSON.stringify({ title: "Version X: tidy", notes: "- tidied" }),
      },
    ],
  });
});

describe("POST /api/webhooks/github (RA-8607)", () => {
  it("two different pushes to main make two releases", async () => {
    const first = await POST(
      pushRequest({ sha: "a".repeat(40), deliveryId: "d-1" }),
    );
    const second = await POST(
      pushRequest({ sha: "b".repeat(40), deliveryId: "d-2" }),
    );
    await drainBackground();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(releases).toHaveLength(2);
    expect(new Set(releases.map((r) => r.version)).size).toBe(2);
  });

  it("a redelivery of the same delivery id makes one release", async () => {
    await POST(pushRequest({ sha: "c".repeat(40), deliveryId: "d-same" }));
    const again = await POST(
      pushRequest({ sha: "c".repeat(40), deliveryId: "d-same" }),
    );
    await drainBackground();

    expect(again.status).toBe(200);
    expect(releases).toHaveLength(1);
  });

  it("the same commit pushed under a new delivery id makes one release", async () => {
    await POST(pushRequest({ sha: "e".repeat(40), deliveryId: "d-x" }));
    await POST(pushRequest({ sha: "e".repeat(40), deliveryId: "d-y" }));
    await drainBackground();

    expect(releases).toHaveLength(1);
  });

  it("a failed notes job marks the row failed, so it is not left looking pending", async () => {
    notesCreate.mockRejectedValue(new Error("no AI key"));

    await POST(pushRequest({ sha: "f".repeat(40), deliveryId: "d-f" }));
    await drainBackground();

    expect(releases).toHaveLength(1);
    expect(releases[0].notes).toBe(RELEASE_NOTES_FAILED);
    expect(RELEASE_NOTES_NOT_READY).toContain(releases[0].notes);
    expect(notifications).toHaveLength(0);
  });

  it("the release notice links to a dashboard page that exists", async () => {
    await POST(pushRequest({ sha: "1".repeat(40), deliveryId: "d-l" }));
    await drainBackground();

    expect(notifications.length).toBeGreaterThan(0);
    for (const n of notifications) {
      expect(n.link).toBe(RELEASE_NOTICE_LINK);
    }
    const pagePath = path.join(
      process.cwd(),
      "app",
      RELEASE_NOTICE_LINK.replace(/^\//, ""),
      "page.tsx",
    );
    expect(RELEASE_NOTICE_LINK).not.toContain("?");
    expect(existsSync(pagePath)).toBe(true);
  });

  it("notifies every matching user, past the old 5000 cap", async () => {
    users = Array.from({ length: 5001 }, (_, i) => ({
      id: `user_${String(i).padStart(5, "0")}`,
    }));

    await POST(pushRequest({ sha: "2".repeat(40), deliveryId: "d-many" }));
    await drainBackground();

    expect(notifications).toHaveLength(5001);
    expect(new Set(notifications.map((n) => n.userId)).size).toBe(5001);
  });
});
