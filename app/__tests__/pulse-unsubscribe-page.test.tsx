import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { client: { update, updateMany } },
}));

import { generatePulseUnsubscribeToken } from "@/lib/pulse/pulse-unsubscribe-token";
import PulseUnsubscribePage, { metadata } from "../pulse/unsubscribe/page";

const render = async (params: { token?: string; done?: string }) =>
  renderToStaticMarkup(
    await PulseUnsubscribePage({ searchParams: Promise.resolve(params) }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PORTAL_SECRET = "test-secret";
});

describe("/pulse/unsubscribe", () => {
  it("asks first and writes nothing when opened", async () => {
    const token = generatePulseUnsubscribeToken("client_a");

    const html = await render({ token });

    expect(html).toContain("Stop job update emails?");
    expect(html).toContain('method="post"');
    expect(html).toContain(
      `action="/api/pulse/unsubscribe?token=${encodeURIComponent(token)}"`,
    );
    expect(html).toContain('name="source"');
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("offers no button on a forged token", async () => {
    const html = await render({ token: "forged" });

    expect(html).toContain("Link not valid");
    expect(html).not.toContain("<form");
  });

  it("offers no button when the secret is unset, rather than crashing", async () => {
    const token = generatePulseUnsubscribeToken("client_a");
    delete process.env.PORTAL_SECRET;
    delete process.env.CLIENT_PORTAL_JWT_SECRET;

    const html = await render({ token });

    expect(html).toContain("Link not valid");
  });

  it("confirms once done", async () => {
    expect(await render({ done: "1" })).toContain("You are unsubscribed");
  });

  it("serves noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
