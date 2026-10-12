import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";

const base = "http://127.0.0.1:3100";
const owner = { userId: "synthetic-a", organizationId: "synthetic-org", workspaceId: null, workspaceOwnerId: null };
const user = { id: owner.userId, email: "synthetic@example.test", name: "Synthetic Tester", role: "ADMIN", organizationId: owner.organizationId, organizationScopeVerified: true, needsOnboarding: false };
const firstClient = { id: "client-a", name: "Synthetic Client A", email: "client-a@example.test", phone: "", company: "", status: "ACTIVE", address: "", createdAt: "2026-10-01T00:00:00Z", reportsCount: 0, openJobCount: 0 };

type Fixture = {
  clients: typeof firstClient[];
  clientReads: number;
  holdClients?: Promise<void>;
  clientNetworkError?: boolean;
  ownerUnverified?: boolean;
  queuePosts: number;
};

async function fixture(page: Page, context: BrowserContext): Promise<Fixture> {
  const { encode } = createRequire(`${process.cwd()}/package.json`)("next-auth/jwt") as typeof import("next-auth/jwt");
  const cookie = await encode({ secret: "synthetic-local-browser-secret", token: { sub: user.id, role: user.role, organizationId: user.organizationId, needsOnboarding: false, setupCompletedAt: "2026-01-01T00:00:00.000Z" } });
  await context.addCookies([{ name: "next-auth.session-token", value: cookie, url: base }]);
  const state: Fixture = { clients: [{ ...firstClient }], clientReads: 0, queuePosts: 0 };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if ((path.includes("/photos") || path.includes("voice-note-transcribe")) && route.request().method() !== "GET") state.queuePosts++;
    if (path === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/auth/offline-context") return state.ownerUnverified
      ? route.fulfill({ status: 403, json: { error: "Unavailable" } })
      : route.fulfill({ json: { owner } });
    if (path === "/api/user/profile") return route.fulfill({ json: { profile: { ...user, businessName: "Synthetic Business", subscriptionStatus: "ACTIVE" } } });
    if (path === "/api/clients") {
      state.clientReads++;
      if (state.holdClients) await state.holdClients;
      if (state.clientNetworkError) return route.abort("internetdisconnected");
      return route.fulfill({ json: { clients: state.clients } });
    }
    if (path === "/api/inspections") return route.fulfill({ json: { inspections: [] } });
    if (path === "/api/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/user/experience-mode") return route.fulfill({ json: { experienceMode: "APPRENTICE" } });
    if (path === "/api/user/product-tour") return route.fulfill({ json: { dismissed: true } });
    if (path === "/api/onboarding/first-run") return route.fulfill({ json: { dismissed: true, allComplete: true, steps: [] } });
    if (path === "/api/billing/trial-status") return route.fulfill({ json: { data: { lifetimeAccess: true, daysRemaining: 1 } } });
    if (path === "/api/user/trial-status") return route.fulfill({ json: { lifetimeAccess: true, subscriptionStatus: "ACTIVE" } });
    return route.fulfill({ json: {} });
  });
  return state;
}

async function pull(page: Page, target: Locator, dy: number, ending: "end" | "cancel" = "end") {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await target.boundingBox();
  if (!box) throw new Error("Pull target is not visible");
  const x = Math.round(box.x + Math.min(box.width / 2, 80));
  const y = Math.round(box.y + Math.min(box.height / 2, 20));
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + Math.round(dy / 2) }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + dy }] });
    await cdp.send("Input.dispatchTouchEvent", { type: ending === "end" ? "touchEnd" : "touchCancel", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

async function putQueueRow(page: Page, name: string, store: string, row: Record<string, unknown>) {
  await page.evaluate(async ({ name, store, row }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(store === "uploads" || store === "notes"
        ? { ...row, blob: new Blob(["synthetic"], { type: store === "uploads" ? "image/jpeg" : "audio/webm" }) }
        : row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event("restoreassist-sync-queue-changed"));
  }, { name, store, row });
}

test("Clients pull from top handles threshold, cancel, nested scroll, duplicates and form drafts", async ({ page, context }) => {
  const state = await fixture(page, context);
  await page.goto("/dashboard/clients");
  await expect(page.getByText("Synthetic Client A").first()).toBeVisible();
  const heading = page.getByRole("heading", { name: "Clients", exact: true });
  const initial = state.clientReads;
  await pull(page, heading, 100);
  await pull(page, heading, 160, "cancel");
  expect(state.clientReads).toBe(initial);

  await page.evaluate(() => {
    const nested = document.createElement("div");
    nested.dataset.testid = "nested-scroll";
    nested.style.cssText = "position:fixed;z-index:1000;left:20px;top:300px;width:180px;height:90px;overflow-y:auto;background:white";
    nested.innerHTML = '<div style="height:500px">Synthetic nested list</div>';
    document.querySelector("main")?.append(nested);
  });
  await pull(page, page.locator('[data-testid="nested-scroll"]'), 160);
  expect(state.clientReads).toBe(initial);
  await page.locator('[data-testid="nested-scroll"]').evaluate((element) => element.remove());

  let release!: () => void;
  state.holdClients = new Promise<void>((resolve) => { release = resolve; });
  await pull(page, heading, 160);
  await expect.poll(() => state.clientReads).toBe(initial + 1);
  await expect(page.getByText("Refreshing…", { exact: true })).toBeVisible();
  await pull(page, heading, 160);
  expect(state.clientReads).toBe(initial + 1);
  release();
  state.holdClients = undefined;
  await expect(page.getByText("Clients updated", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add Client" }).click();
  const name = page.getByPlaceholder("Enter client name");
  await name.fill("Unsaved synthetic intake");
  const beforeFormPull = state.clientReads;
  await pull(page, page.getByRole("heading", { name: "Add New Client" }), 160);
  await expect(name).toHaveValue("Unsaved synthetic intake");
  expect(state.clientReads).toBe(beforeFormPull);
  expect(state.queuePosts).toBe(0);
});

test("Clients reports offline/error/recovery and badge distinguishes pending uploads and failed saves", async ({ page, context }) => {
  const state = await fixture(page, context);
  await page.goto("/dashboard/clients");
  await expect(page.getByText("Synthetic Client A").first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Sync status: Synced" })).toBeVisible();
  const heading = page.getByRole("heading", { name: "Clients", exact: true });

  state.clientNetworkError = true;
  await context.setOffline(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
  });
  await pull(page, heading, 160);
  await expect(page.getByText("Could not refresh clients. Showing the last loaded list.")).toBeVisible();
  await expect(page.getByText("Synthetic Client A").first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Sync status: Offline" })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("online"));
  });
  state.clientNetworkError = false;
  state.clients = [{ ...firstClient, name: "Synthetic Client Recovered" }];
  await pull(page, heading, 160);
  await expect(page.getByText("Synthetic Client Recovered").first()).toBeVisible();
  await expect(page.getByText("Clients updated", { exact: true })).toBeVisible();

  await putQueueRow(page, "ra-evidence-queue", "uploads", { id: "synthetic-photo", owner, inspectionId: "synthetic-job", retryCount: 0 });
  await putQueueRow(page, "ra-voice-note-queue", "notes", { id: "synthetic-voice", owner, inspectionId: "synthetic-job", fieldLabel: "notes", status: "pending", retryCount: 0 });
  await expect(page.getByRole("status", { name: "Sync status: Pending sync" })).toContainText("(2)");
  await putQueueRow(page, "nir-offline-queue", "sync-queue", { id: "synthetic-failed", owner, inspectionId: "synthetic-job", status: "failed", retryCount: 5 });
  await expect(page.getByRole("status", { name: "Sync status: Sync needs attention" })).toBeVisible();
  expect(state.queuePosts).toBe(0);
});

test("a pull during the initial Clients read starts a new request", async ({ page, context }) => {
  const state = await fixture(page, context);
  let release!: () => void;
  state.holdClients = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/dashboard/clients");
  const heading = page.getByRole("heading", { name: "Clients", exact: true });
  await expect(heading).toBeVisible();
  await expect.poll(() => state.clientReads).toBe(1);
  await pull(page, heading, 160);
  await expect.poll(() => state.clientReads).toBe(2);
  release();
  state.holdClients = undefined;
  await expect(page.getByText("Synthetic Client A").first()).toBeVisible();
  await expect(page.getByText("Clients updated", { exact: true })).toBeVisible();
});

test("an authenticated tab without a verified offline owner does not show Synced", async ({ page, context }) => {
  const state = await fixture(page, context);
  state.ownerUnverified = true;
  await page.goto("/dashboard/clients");
  await expect(page.getByText("Synthetic Client A").first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Sync status: Sync status unavailable" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Sync status: Synced" })).toHaveCount(0);
  state.ownerUnverified = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status", { name: "Sync status: Synced" })).toBeVisible();
  expect(state.queuePosts).toBe(0);
});

test("Field, Inspections and Reports lists each fetch fresh data on mobile pull", async ({ page, context }) => {
  await fixture(page, context);
  for (const [path, title, result] of [
    ["/dashboard/field", "Field Dashboard", "Jobs updated"],
    ["/dashboard/inspections", "Inspections", "Inspections updated"],
    ["/dashboard/reports", "Reports", "Reports updated"],
  ] as const) {
    await page.goto(path);
    const heading = page.getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeVisible();
    await pull(page, heading, 160);
    await expect(page.getByText(result, { exact: true })).toBeVisible();
  }
});
