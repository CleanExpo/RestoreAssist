import { describe, expect, it } from "vitest";
import {
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_SCRIPT,
  parseFirstTouch,
} from "../attribution";

/** Run the inline script against a fake browser and return the cookie it set. */
function runScript(opts: {
  url: string;
  referrer?: string;
  cookie?: string;
}): string {
  const u = new URL(opts.url);
  let jar = opts.cookie ?? "";
  const document = {
    referrer: opts.referrer ?? "",
    get cookie() {
      return jar;
    },
    set cookie(v: string) {
      jar = v;
    },
  };
  const location = {
    search: u.search,
    hostname: u.hostname,
    pathname: u.pathname,
    protocol: u.protocol,
  };
  new Function("document", "location", FIRST_TOUCH_SCRIPT)(document, location);
  return jar;
}

function cookieValue(jar: string): string | undefined {
  const pair = jar.split(";")[0];
  return pair.startsWith(`${FIRST_TOUCH_COOKIE}=`)
    ? pair.slice(FIRST_TOUCH_COOKIE.length + 1)
    : undefined;
}

describe("FIRST_TOUCH_SCRIPT", () => {
  it("stores UTM tags, external referrer host and landing path", () => {
    const jar = runScript({
      url: "https://restoreassist.app/pricing?utm_source=synthex&utm_medium=linkedin&utm_campaign=water-damage-oct",
      referrer: "https://www.linkedin.com/feed/?x=secret",
    });
    expect(jar).toContain("Max-Age=7776000");
    expect(jar).toContain("Secure");
    const parsed = parseFirstTouch(cookieValue(jar));
    expect(parsed).toMatchObject({
      source: "synthex",
      medium: "linkedin",
      campaign: "water-damage-oct",
      referrer: "www.linkedin.com",
      landing: "/pricing",
    });
    expect(parsed?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps the first touch: an existing cookie is never overwritten", () => {
    const existing = `${FIRST_TOUCH_COOKIE}=${encodeURIComponent('{"source":"first"}')}`;
    const jar = runScript({
      url: "https://restoreassist.app/?utm_source=second",
      cookie: existing,
    });
    expect(jar).toBe(existing);
  });

  it("drops same-site referrers and maps click ids to a source", () => {
    const jar = runScript({
      url: "https://restoreassist.app/signup?gclid=abc",
      referrer: "https://restoreassist.app/features",
    });
    const parsed = parseFirstTouch(cookieValue(jar));
    expect(parsed?.source).toBe("google-ads");
    expect(parsed?.referrer).toBeUndefined();
    expect(parsed?.landing).toBe("/signup");
  });
});

describe("parseFirstTouch", () => {
  it("returns null for missing, malformed or non-object values", () => {
    expect(parseFirstTouch(undefined)).toBeNull();
    expect(parseFirstTouch("not-json")).toBeNull();
    expect(parseFirstTouch(encodeURIComponent("[1,2]"))).toBeNull();
    expect(parseFirstTouch(encodeURIComponent("{}"))).toBeNull();
  });

  it("keeps only known string keys, strips control characters and clamps length", () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        source: "evil\u0000\nsource",
        campaign: "x".repeat(500),
        medium: 42,
        injected: "nope",
      }),
    );
    const parsed = parseFirstTouch(raw);
    expect(parsed).toEqual({ source: "evilsource", campaign: "x".repeat(120) });
  });
});
