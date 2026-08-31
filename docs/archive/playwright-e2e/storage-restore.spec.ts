import { expect, test } from "@playwright/test";

import { loginAs } from "./_helpers/auth";

/**
 * SP-E storage restore — the owner-facing surface.
 *
 * WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------
 * Read the scope before mapping this anywhere. It covers the restore SURFACE:
 * the owner-only gate, the API contract, the preview computation, and the jobs
 * table. **No file is restored.** No byte moves from Google Drive to Supabase,
 * and nothing here would notice if `rehydrateOne` were broken.
 *
 * That limit is not laziness, it is the shape of the thing. A real restore
 * needs a `COMPLETED` `StorageMirrorJob` carrying a `driveFileId`
 * (`lib/restore/plan.ts:13-19`), which can only be produced by closing a job
 * against a live Google Drive connection. Drive I/O runs server-side in the
 * Next process via `googleapis`, so `context.route()` cannot intercept it —
 * Playwright can only mock what the BROWSER requests. There is no
 * env-driven Drive fake and no `seed-mirror-job` test helper.
 *
 * So this spec is written at the strongest level reachable with no new product
 * code, and `A1_STEP_COVERAGE` still maps `restore: []`. Claiming the journey
 * step on this file would be the same over-claim corrected twice already in
 * that producer's history: measuring a real thing that is not the thing the
 * criterion names.
 *
 * WHAT WOULD CLOSE THE GAP
 * ------------------------
 * The opening is `lib/restore/rehydrate.ts:26-28`: in `MISSING` mode, a file
 * already present in Supabase returns `SKIPPED` **before** `getMirrorStorageProvider`
 * is called — so the full queue traversal (enqueue, cron claim, `rehydrateOne`,
 * status write, UI) runs with no Drive connection and no Drive network call at
 * all. Reaching it needs one `ALLOW_TEST_HELPERS`-gated route seeding a
 * `COMPLETED` mirror job whose `sourceStoragePath` points at an object the spec
 * uploaded first, plus `CRON_SECRET` in the Playwright environment to poke
 * `/api/cron/storage-restore` rather than waiting up to ten minutes for the
 * tick. That is product code, and it belongs in its own reviewed change.
 *
 * Even then the three things that matter most — the Drive download, the SHA-256
 * integrity check, and the Supabase write-back — stay unproven in CI. They need
 * a live Drive account, and that cannot run here. Better to say so than to grow
 * a spec that looks like it covers them.
 */

const RESTORE_API = "/api/storage/restore?scope=org";

test.describe("storage restore — owner surface", () => {
  test("rejects unauthenticated callers", async ({ request }) => {
    // Deliberately on `request`, which carries no session cookie.
    const res = await request.get(RESTORE_API);
    expect(res.status()).toBe(401);
  });

  test("owner sees the restore section and its jobs table", async ({ page }) => {
    await loginAs(page, "USER");
    await page.goto("/dashboard/settings/storage");

    // `/api/test/sign-in-as` creates the user's org with `ownerId: user.id`,
    // so this session satisfies `requireOwner()` and the section renders.
    // A non-owner would not see it at all -- the page gates on `isOwner`.
    await expect(
      page.getByRole("heading", { name: "Restore from Drive" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Re-hydrate original files lost from primary storage/i),
    ).toBeVisible();
  });

  test("the API answers with the documented shape", async ({ page }) => {
    await loginAs(page, "USER");
    const res = await page.request.get(RESTORE_API);
    expect(res.ok()).toBe(true);

    const body = (await res.json()) as {
      data?: {
        fileCount?: unknown;
        stats?: unknown;
        jobs?: unknown;
      };
    };
    // Shape, not values. A fresh org legitimately has nothing to restore, and
    // asserting a positive count would make this fail for the wrong reason.
    expect(body.data).toBeDefined();
    expect(typeof body.data?.fileCount).toBe("number");
    expect(body.data?.stats).toBeDefined();
    expect(Array.isArray(body.data?.jobs)).toBe(true);
  });

  test("preview reports a restorable count without enqueuing anything", async ({
    page,
  }) => {
    await loginAs(page, "USER");
    await page.goto("/dashboard/settings/storage");

    const before = (await (await page.request.get(RESTORE_API)).json()) as {
      data: { jobs: unknown[] };
    };

    await page.getByRole("button", { name: /^Preview$/i }).click();
    await expect(page.getByText(/file\(s\) restorable from Drive/i)).toBeVisible();

    // The point of a preview: it must not queue work. A preview that enqueued
    // would be a destructive button labelled as a safe one.
    const after = (await (await page.request.get(RESTORE_API)).json()) as {
      data: { jobs: unknown[] };
    };
    expect(after.data.jobs.length).toBe(before.data.jobs.length);
  });

  test("defaults to the non-destructive MISSING mode", async ({ page }) => {
    // FORCE overwrites files that are already present. The default must be the
    // safe one, and a default that silently flipped would be discovered by a
    // customer rather than by a test.
    await loginAs(page, "USER");
    await page.goto("/dashboard/settings/storage");

    const missing = page.getByRole("radio", { name: /missing/i });
    await expect(missing).toBeChecked();
  });
});
