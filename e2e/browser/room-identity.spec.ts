import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const base = "http://127.0.0.1:3101";

test("iPhone-sized NIR form keeps numbered and named rooms distinct", async ({ page, context }) => {
  const { encode } = createRequire(`${process.cwd()}/package.json`)(
    "next-auth/jwt",
  ) as typeof import("next-auth/jwt");
  const cookie = await encode({
    secret: "synthetic-local-browser-secret",
    token: {
      sub: "synthetic-room-user",
      role: "ADMIN",
      organizationId: "synthetic-room-org",
      needsOnboarding: false,
      setupCompletedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  await context.addCookies([
    { name: "next-auth.session-token", value: cookie, url: base },
  ]);

  let mutations = 0;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (route.request().method() !== "GET") mutations++;
    if (url.pathname === "/api/auth/session") {
      return route.fulfill({
        json: {
          user: {
            id: "synthetic-room-user",
            email: "synthetic@example.test",
            role: "ADMIN",
            organizationId: "synthetic-room-org",
            organizationScopeVerified: true,
            needsOnboarding: false,
          },
          expires: "2099-01-01T00:00:00.000Z",
        },
      });
    }
    if (url.pathname === "/api/auth/offline-context") {
      return route.fulfill({
        json: {
          owner: {
            userId: "synthetic-room-user",
            organizationId: "synthetic-room-org",
            workspaceId: null,
            workspaceOwnerId: null,
          },
        },
      });
    }
    if (url.pathname === "/api/user/quick-fill-credits") {
      return route.fulfill({ json: { creditsRemaining: 0 } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/dashboard/inspections/new");
  await expect(page.getByRole("heading", { name: "New Inspection" })).toBeVisible();
  const type = page.locator("label").filter({ hasText: "Room Type" }).locator("..").locator("select");
  await expect(type.locator("option")).toHaveCount(17);
  const choices = await type.locator("option").allTextContents();
  expect(choices).toEqual(expect.arrayContaining(["Bedroom", "Bathroom", "Kitchen", "Office", "Other"]));
  const name = page.getByPlaceholder("e.g. 4 or Rear Lounge");
  const length = page.locator("label").filter({ hasText: "Length (m)" }).locator("..").locator("input");
  const width = page.locator("label").filter({ hasText: "Width (m)" }).locator("..").locator("input");

  await type.selectOption("Bedroom");
  await name.fill("4");
  await length.fill("4");
  await width.fill("3");
  await page.getByLabel("Carpet", { exact: true }).check();
  await page.getByRole("button", { name: "Add Area" }).click();
  await expect(page.getByText("Bedroom 4", { exact: true })).toBeVisible();

  await type.selectOption("Living Room");
  await name.fill("Rear Lounge");
  await length.fill("5");
  await width.fill("4");
  await page.getByLabel("Carpet", { exact: true }).check();
  await page.getByRole("button", { name: "Add Area" }).click();
  await expect(page.getByText("Living Room — Rear Lounge", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Remove area")).toHaveCount(2);

  await type.selectOption("Bedroom");
  await name.fill("4");
  await length.fill("4");
  await width.fill("3");
  await page.getByLabel("Carpet", { exact: true }).check();
  await page.getByRole("button", { name: "Add Area" }).click();
  await expect(page.getByTitle("Remove area")).toHaveCount(2);
  await page.screenshot({ path: "test-results/room-identity/numbered-and-named-rooms-iphone.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByText("Bedroom 4", { exact: true })).toBeVisible();
  await expect(page.getByText("Living Room — Rear Lounge", { exact: true })).toBeVisible();
  expect(mutations).toBe(0);
});

test("iPhone-sized NIR photo retains a failed upload and verifies the same-key retry", async ({ page, context }) => {
  const { encode } = createRequire(`${process.cwd()}/package.json`)(
    "next-auth/jwt",
  ) as typeof import("next-auth/jwt");
  const cookie = await encode({
    secret: "synthetic-local-browser-secret",
    token: {
      sub: "synthetic-room-user",
      role: "ADMIN",
      organizationId: "synthetic-room-org",
      needsOnboarding: false,
      setupCompletedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  await context.addCookies([{ name: "next-auth.session-token", value: cookie, url: base }]);
  const keys: string[] = [];
  let postCount = 0;
  let readCount = 0;
  const photo = {
    id: "synthetic-photo",
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFQ0AAAAASUVORK5CYII=",
  };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: {
      user: { id: "synthetic-room-user", email: "synthetic@example.test", role: "ADMIN",
        organizationId: "synthetic-room-org", organizationScopeVerified: true, needsOnboarding: false },
      expires: "2099-01-01T00:00:00.000Z",
    } });
    if (url.pathname === "/api/auth/offline-context") return route.fulfill({ json: {
      owner: { userId: "synthetic-room-user", organizationId: "synthetic-room-org",
        workspaceId: null, workspaceOwnerId: null },
    } });
    if (url.pathname === "/api/user/quick-fill-credits") return route.fulfill({ json: { creditsRemaining: 0 } });
    if (url.pathname === "/api/inspections" && route.request().method() === "POST") {
      return route.fulfill({ status: 201, json: { inspection: { id: "synthetic-job" } } });
    }
    if (url.pathname === "/api/inspections/synthetic-job/photos") {
      if (route.request().method() === "POST") {
        postCount++;
        keys.push(route.request().headers()["idempotency-key"] ?? "");
        return postCount === 1
          ? route.fulfill({ status: 503, json: { error: "Synthetic upload failure" } })
          : route.fulfill({ status: 201, json: { photo } });
      }
      readCount++;
      return route.fulfill({ json: { photos: postCount > 1 ? [photo] : [] } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/dashboard/inspections/new");
  await page.getByRole("radio", { name: "Mould Remediation (IICRC S520:2024)" }).check();
  await page.getByPlaceholder("Full property address").fill("1 Synthetic Street");
  await page.getByPlaceholder("0000").fill("4000");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "kitchen.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]),
  });
  await expect(page.getByText("Synthetic upload failure")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry this photo" })).toBeVisible();
  await page.getByRole("button", { name: "Review & Submit" }).click();
  await expect(page.getByRole("button", { name: "Retry this photo" })).toBeVisible();
  await page.getByRole("button", { name: "Retry this photo" }).click();
  await expect(page.getByAltText("Photo 1")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^nir-photo-/);
  expect(keys[1]).toBe(keys[0]);
  expect(readCount).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: "test-results/room-identity/nir-photo-recovery-iphone.png", fullPage: true });
});
