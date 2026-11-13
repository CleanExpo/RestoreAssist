/**
 * First-touch signup attribution.
 *
 * Marketing campaigns (Synthex, CCW distribution, email, paid) need to know
 * which source produced a trial. Before this, a signup recorded no source at
 * all, so no campaign could be credited with a trial or a paid conversion.
 *
 * FIRST_TOUCH_SCRIPT runs inline in the root layout. On the first page view
 * with no existing cookie it stores the UTM tags, the referring host and the
 * landing path in a first-party cookie for 90 days. The signup routes read it
 * with parseFirstTouch() and attach it to the `signup_completed` activation
 * event. No PII is stored: the referrer is reduced to its host.
 */

export const FIRST_TOUCH_COOKIE = "ra_ft";

const MAX_LEN = 120;

export type FirstTouch = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrer?: string;
  landing?: string;
  at?: string;
};

const KEYS: (keyof FirstTouch)[] = [
  "source",
  "medium",
  "campaign",
  "content",
  "term",
  "referrer",
  "landing",
  "at",
];

/**
 * Inline script. Kept dependency-free and wrapped in try/catch so a cookie
 * failure can never break page load. Same-site referrers are dropped so an
 * internal navigation is not mistaken for the acquisition source.
 */
export const FIRST_TOUCH_SCRIPT = `(function(){try{var n="${FIRST_TOUCH_COOKIE}";if(document.cookie.split("; ").some(function(c){return c.indexOf(n+"=")===0}))return;var q=new URLSearchParams(location.search),o={},k={source:"utm_source",medium:"utm_medium",campaign:"utm_campaign",content:"utm_content",term:"utm_term"};for(var f in k){var v=q.get(k[f]);if(v)o[f]=v.slice(0,${MAX_LEN})}if(!o.source&&q.get("gclid"))o.source="google-ads";if(!o.source&&q.get("fbclid"))o.source="meta";if(document.referrer){var h=new URL(document.referrer).hostname;if(h&&h!==location.hostname)o.referrer=h.slice(0,${MAX_LEN})}o.landing=location.pathname.slice(0,${MAX_LEN});o.at=new Date().toISOString();document.cookie=n+"="+encodeURIComponent(JSON.stringify(o))+"; Max-Age=7776000; Path=/; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")}catch(e){}})();`;

/**
 * Parse and sanitise the raw cookie value. Returns null for a missing,
 * malformed or empty cookie. Only known keys survive, each clamped to a
 * short printable string, because the cookie is attacker-controlled input.
 */
export function parseFirstTouch(raw: string | undefined | null): FirstTouch | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const out: FirstTouch = {};
  for (const key of KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    const clean = value.replace(/[^\x20-\x7E]/g, "").trim().slice(0, MAX_LEN);
    if (clean) out[key] = clean;
  }
  return Object.keys(out).length > 0 ? out : null;
}
