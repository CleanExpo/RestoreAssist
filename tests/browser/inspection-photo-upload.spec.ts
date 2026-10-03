import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { createRequire } from "node:module";

const base = "http://127.0.0.1:3100";
const user = { id: "synthetic-user", email: "synthetic@example.test", name: "Synthetic Tester", role: "ADMIN", organizationId: "synthetic-org", organizationScopeVerified: true, needsOnboarding: false };
const photo = {
  id: "persisted-photo", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFQ0AAAAASUVORK5CYII=", thumbnailUrl: null,
  location: null, description: null, timestamp: "2026-10-02T00:00:00.000Z", fileSize: 3, mimeType: "image/jpeg",
  damageCategory: null, damageClass: null, s500SectionRef: null, roomType: null, moistureSource: null,
  affectedMaterial: [], surfaceOrientation: null, damageExtentEstimate: null, equipmentVisible: false,
  secondaryDamageIndicators: [], photoStage: null, captureAngle: null, labelledBy: "TECHNICIAN",
  technicianNotes: null, moistureReadingLink: null, aiLabels: null, aiConfidence: null, aiModel: null, aiRunAt: null, metadata: {},
};

async function fixture(page: Page, context: BrowserContext) {
  const { encode } = createRequire(`${process.cwd()}/package.json`)("next-auth/jwt") as typeof import("next-auth/jwt");
  const cookie = await encode({ secret: "synthetic-local-browser-secret", token: { sub: user.id, role: user.role, organizationId: user.organizationId, needsOnboarding: false, setupCompletedAt: "2026-01-01T00:00:00.000Z" } });
  await context.addCookies([{ name: "next-auth.session-token", value: cookie, url: base }]);
  const state = { photos: [] as typeof photo[], postStatus: 400, postCount: 0, readCount: 0 };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/auth/offline-context") return route.fulfill({ json: { owner: { userId: user.id, organizationId: user.organizationId, workspaceId: null, workspaceOwnerId: null } } });
    if (path === "/api/user/profile") return route.fulfill({ json: { profile: { ...user, businessName: "Synthetic Business", subscriptionStatus: "ACTIVE" } } });
    if (path === "/api/inspections/synthetic-job") return route.fulfill({ json: { inspection: { id: "synthetic-job", inspectionNumber: "NIR-SYNTHETIC", propertyAddress: "Synthetic site" } } });
    if (path === "/api/inspections/synthetic-job/photos") {
      if (route.request().method() === "POST") {
        state.postCount++;
        if (state.postStatus !== 201) return route.fulfill({ status: state.postStatus, json: { error: { message: "Synthetic rejection" } } });
        state.photos = [photo];
        return route.fulfill({ status: 201, json: { photo } });
      }
      state.readCount++;
      return route.fulfill({ json: { photos: state.photos } });
    }
    if (path === "/api/user/experience-mode") return route.fulfill({ json: { experienceMode: "APPRENTICE" } });
    if (path === "/api/user/product-tour") return route.fulfill({ json: { dismissed: true } });
    if (path === "/api/onboarding/first-run") return route.fulfill({ json: { dismissed: true, allComplete: true, steps: [] } });
    if (path === "/api/billing/trial-status") return route.fulfill({ json: { data: { lifetimeAccess: true, daysRemaining: 1 } } });
    if (path === "/api/user/trial-status") return route.fulfill({ json: { lifetimeAccess: true, subscriptionStatus: "ACTIVE" } });
    return route.fulfill({ json: {} });
  });
  return state;
}

test("synthetic 375px photo upload rejects truthfully then verifies a same-job retry", async ({ page, context }) => {
  const state = await fixture(page, context);
  await page.goto("/dashboard/inspections/synthetic-job/photos");
  await expect(page.getByText("Photo Evidence")).toBeVisible();
  await page.getByLabel("Choose inspection photos").setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) });
  await expect(page.getByText(/Synthetic rejection/)).toBeVisible();
  expect(state.postCount).toBe(1);
  await expect(page.getByText("0 of 0 photos")).toBeVisible();

  state.postStatus = 201;
  await page.getByRole("button", { name: "Retry this photo" }).click();
  await expect(page.getByText("1 of 1 photo")).toBeVisible();
  expect(state.postCount).toBe(2);
  expect(state.readCount).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Retry this photo" })).toHaveCount(0);
});

test("synthetic Chromium cannot decode HEIC and never sends rejected bytes", async ({ page, context }) => {
  const state = await fixture(page, context);
  await page.goto("/dashboard/inspections/synthetic-job/photos");
  await expect(page.getByText("Photo Evidence")).toBeVisible();
  await page.getByLabel("Choose inspection photos").setInputFiles({ name: "room.heic", mimeType: "image/heic", buffer: Buffer.from("synthetic unsupported HEIC") });
  await expect(page.getByText(/could not convert on this device/i)).toBeVisible();
  expect(state.postCount).toBe(0);
  await expect(page.getByRole("button", { name: "Retry this photo" })).toBeVisible();
});
