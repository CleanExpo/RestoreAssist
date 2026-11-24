/**
 * RA-7877 — staff can start a claim with no cell service, from a cold start.
 *
 * Runs against a PRODUCTION build (config/playwright.offline.config.ts): the
 * service worker registers only there. The browser really goes offline
 * (context.setOffline) and the page is really closed and reopened. The API is
 * replaced by counted route handlers, so the assertions below are about what
 * the browser sends and when; the server's own idempotency and owner checks
 * are covered by the route and proxy tests.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Account = { id: string; org: string };
const A: Account = { id: "user-a", org: "org-a" };
const B: Account = { id: "user-b", org: "org-b" };
const owner = (a: Account) => ({ userId: a.id, organizationId: a.org, workspaceId: null, workspaceOwnerId: null });

interface Server {
  account: Account | null;
  creates: Array<{ key: string | null; body: Record<string, unknown>; ownerHeader: string | null }>;
  photos: number;
}

async function mockServer(context: BrowserContext, server: Server) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
  await context.route("**/api/auth/session", (route) =>
    route.fulfill(json(server.account
      ? { user: { id: server.account.id, name: "Test Technician" }, expires: new Date(Date.now() + 36e5).toISOString() }
      : {})),
  );
  await context.route(/\/api\/auth\/(csrf|providers|_log)/, (route) => route.fulfill(json({})));
  await context.route("**/api/auth/offline-context", (route) =>
    server.account ? route.fulfill(json({ owner: owner(server.account) })) : route.fulfill(json({ owner: null }, 401)),
  );
  await context.route("**/api/inspections", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill(json({ inspections: [] }));
    const headers = request.headers();
    server.creates.push({
      key: headers["idempotency-key"] ?? null,
      body: request.postDataJSON(),
      ownerHeader: headers["x-restoreassist-offline-owner"] ?? null,
    });
    return route.fulfill(json({ inspection: { id: "server-inspection-1" } }, 201));
  });
  await context.route("**/api/inspections/*/photos", async (route) => {
    if (route.request().method() === "POST") {
      server.photos++;
      return route.fulfill(json({ photo: { id: "photo-1" } }, 201));
    }
    return route.fulfill(json({ photos: [{ id: "photo-1", url: "https://files.example.test/photo-1.jpg" }] }));
  });
}

/**
 * Read a store without ever creating the database: indexedDB.open() on a name the
 * app has not opened yet would create an empty one and the app's own open (same
 * version) would then never get to create its store.
 */
async function readStore(page: Page, db: string, store: string): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    async ([dbName, storeName]) => {
      const known = await indexedDB.databases();
      if (!known.some((d) => d.name === dbName)) return [];
      return new Promise<Array<Record<string, unknown>>>((resolve) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          if (!open.result.objectStoreNames.contains(storeName)) {
            open.result.close();
            return resolve([]);
          }
          const all = open.result.transaction(storeName, "readonly").objectStore(storeName).getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(all.result);
          };
          all.onerror = () => resolve([]);
        };
      });
    },
    [db, store],
  );
}

/** Online sign-in: the provider verifies the account and the device remembers it. */
async function signInOnline(page: Page, account: Account) {
  await page.goto("/offline");
  await expect
    .poll(async () => {
      const rows = await readStore(page, "ra-offline-identity", "identity");
      return (rows[0]?.owner as { userId?: string } | undefined)?.userId;
    }, { timeout: 20_000 })
    .toBe(account.id);
}

async function waitForOfflineShell(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cached = await caches.match("/offline");
          const names = await caches.keys();
          let assets = 0;
          for (const name of names.filter((n) => n.endsWith("-static"))) assets += (await (await caches.open(name)).keys()).length;
          return Boolean(cached) && assets > 0;
        }),
      { timeout: 30_000, message: "service worker must have cached /offline and its static files" },
    )
    .toBe(true);
}

/** Closing the page and opening a new one is a cold start of the app. */
async function coldStartOffline(context: BrowserContext, previous: Page): Promise<Page> {
  await previous.close();
  const page = await context.newPage();
  // A private page: the service worker answers with the cached /offline shell.
  await page.goto("/dashboard/field").catch(() => undefined);
  return page;
}

test.describe("offline cold start (RA-7877)", () => {
  let server: Server;
  test.beforeEach(async ({ context }) => {
    server = { account: A, creates: [], photos: 0 };
    await mockServer(context, server);
  });

  test("shell opens offline, claim and photo are queued, and sync creates it exactly once", async ({ context, page }) => {
    await signInOnline(page, A);
    await waitForOfflineShell(page);

    await context.setOffline(true);
    let offline = await coldStartOffline(context, page);
    await expect(offline.getByTestId("offline-capture")).toBeVisible({ timeout: 20_000 });

    await offline.getByLabel("Property address").fill("12 Example Street, Brisbane");
    await offline.getByLabel("Postcode").fill("4000");
    await offline.getByLabel("Notes (optional)").fill("Burst pipe in laundry");
    await offline.locator('input[name="photo"]').setInputFiles({
      name: "laundry.jpg",
      mimeType: "image/jpeg",
      // A real 1x1 JPEG: the queue compresses and hashes the photo before saving it.
      buffer: Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"),
    });
    // A double tap must save one claim, not two.
    await offline.getByRole("button", { name: /Save claim on this device/ }).dblclick();
    await expect(offline.getByTestId("offline-capture-saved")).toBeVisible();
    await expect(offline.getByTestId("offline-capture-count")).toHaveText("1 claim waiting to send.");
    expect(server.creates, "nothing may reach the server while offline").toHaveLength(0);

    // Kill the app and reopen it: the claim is still on the device.
    offline = await coldStartOffline(context, offline);
    await expect(offline.getByTestId("offline-capture-count")).toHaveText("1 claim waiting to send.");
    const stored = await readStore(offline, "ra-offline-claims", "claims");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ propertyAddress: "12 Example Street, Brisbane", propertyPostcode: "4000", state: "queued" });
    expect(stored[0]).not.toHaveProperty("inspectionDate");

    // The network returns: the claim is created once, scoped to its owner.
    await context.setOffline(false);
    await offline.goto("/offline");
    await expect.poll(() => server.creates.length, { timeout: 30_000 }).toBe(1);
    await expect.poll(() => server.photos, { timeout: 30_000 }).toBe(1);
    expect(server.creates[0].key).toMatch(/^offline-claim-[0-9a-f-]{36}$/);
    expect(server.creates[0].body).toEqual({
      propertyAddress: "12 Example Street, Brisbane",
      propertyPostcode: "4000",
      lossDescription: "Burst pipe in laundry",
    });
    expect(JSON.parse(decodeURIComponent(server.creates[0].ownerHeader!))).toEqual(owner(A));
    await expect.poll(async () => (await readStore(offline, "ra-offline-claims", "claims")).length).toBe(0);

    // Reloading, and a second tab-like visit, must not send it again.
    await offline.reload();
    await offline.waitForTimeout(2000);
    expect(server.creates).toHaveLength(1);
    expect(server.photos).toBe(1);
  });

  test("a device identity that has expired is refused: no capture form, nothing saved", async ({ context, page }) => {
    await signInOnline(page, A);
    await waitForOfflineShell(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open("ra-offline-identity");
          open.onsuccess = () => {
            const store = open.result.transaction("identity", "readwrite").objectStore("identity");
            const read = store.get("device");
            read.onsuccess = () => {
              const row = read.result;
              row.verifiedAt = new Date(Date.now() - 20 * 36e5).toISOString();
              row.expiresAt = new Date(Date.now() - 8 * 36e5).toISOString();
              store.put(row).onsuccess = () => resolve();
            };
          };
        }),
    );
    await context.setOffline(true);
    const offline = await coldStartOffline(context, page);
    await expect(offline.getByTestId("offline-capture-closed")).toBeVisible({ timeout: 20_000 });
    await expect(offline.getByTestId("offline-capture")).toHaveCount(0);
    expect(await readStore(offline, "ra-offline-claims", "claims")).toHaveLength(0);
  });

  test("after sign-out nothing opens offline", async ({ context, page }) => {
    await signInOnline(page, A);
    await waitForOfflineShell(page);
    // The session ends (sign-out in another tab, expiry): the provider clears the
    // offline context, which wipes the device copy (lib/offline/account-boundary.ts).
    server.account = null;
    await page.reload();
    await expect
      .poll(async () => (await readStore(page, "ra-offline-identity", "identity")).length, { timeout: 20_000 })
      .toBe(0);
    await context.setOffline(true);
    const offline = await coldStartOffline(context, page);
    await expect(offline.getByTestId("offline-capture-closed")).toBeVisible({ timeout: 20_000 });
  });

  test("a second account on the same device sees none of the first account's claims and never sends them", async ({ context, page }) => {
    await signInOnline(page, A);
    await waitForOfflineShell(page);
    await context.setOffline(true);
    let offline = await coldStartOffline(context, page);
    await offline.getByLabel("Property address").fill("99 Private Road, Perth");
    await offline.getByLabel("Postcode").fill("6000");
    await offline.getByRole("button", { name: /Save claim on this device/ }).click();
    await expect(offline.getByTestId("offline-capture-count")).toHaveText("1 claim waiting to send.");

    // Account B signs in on the same device.
    await context.setOffline(false);
    server.account = B;
    await offline.goto("/offline");
    await expect
      .poll(async () => ((await readStore(offline, "ra-offline-identity", "identity"))[0]?.owner as { userId?: string } | undefined)?.userId, { timeout: 20_000 })
      .toBe(B.id);
    await expect(offline.getByTestId("offline-capture-count")).toHaveText("No claims waiting to send.");
    await offline.waitForTimeout(2000);
    expect(server.creates, "account A's claim must not be sent under account B").toHaveLength(0);
    // It is kept for A, not deleted.
    expect(await readStore(offline, "ra-offline-claims", "claims")).toHaveLength(1);

    // Cold start offline as B: still none of A's data.
    await context.setOffline(true);
    offline = await coldStartOffline(context, offline);
    await expect(offline.getByTestId("offline-capture-count")).toHaveText("No claims waiting to send.");
  });
});
