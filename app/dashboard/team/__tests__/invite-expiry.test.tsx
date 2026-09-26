import { describe, expect, it } from "vitest";
import { formatInviteExpiry } from "../invite-expiry";

const NOW = Date.parse("2026-09-26T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("formatInviteExpiry (J-13)", () => {
  it("counts forward for an invite that has not expired", () => {
    expect(formatInviteExpiry(at(7 * DAY - 5000), NOW)).toBe("Expires in 7 days");
    expect(formatInviteExpiry(at(DAY), NOW)).toBe("Expires in 1 day");
    expect(formatInviteExpiry(at(2 * 60 * 60 * 1000), NOW)).toBe("Expires in under a day");
  });

  it("says expired, not 'Expires … ago', once the date has passed", () => {
    expect(formatInviteExpiry(at(-3 * DAY), NOW)).toBe("Expired 3 days ago");
    expect(formatInviteExpiry(at(-DAY), NOW)).toBe("Expired 1 day ago");
    expect(formatInviteExpiry(at(-60 * 1000), NOW)).toBe("Expired today");
  });
});
