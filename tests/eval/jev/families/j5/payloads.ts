/**
 * J5 attack payloads. Each is applied to one body field at a time. The two
 * prototype payloads cannot be written as JS object literals (a literal
 * `__proto__` key sets the prototype instead of an own key), so they are
 * markers the serializer swaps for raw JSON text.
 */
export const PROTO_MARK = "__JEV_PROTO_MARK__";
export const CTOR_MARK = "__JEV_CTOR_MARK__";
export const PROTO_JSON = '{"__proto__":{"jevPolluted":"yes"}}';
export const CTOR_JSON = '{"constructor":{"prototype":{"jevPolluted":"yes"}}}';

export const PAYLOADS: Record<string, unknown> = {
  xss_script: "<script>alert(1)</script>",
  xss_img: '"><img src=x onerror=alert(1)>',
  xss_js: "javascript:alert(1)",
  xss_svg: "<svg/onload=alert(1)>",
  sqli_or: "' OR '1'='1",
  sqli_drop: "'; DROP TABLE \"User\"; --",
  sqli_union: "1 UNION SELECT password FROM \"User\"--",
  sqli_comment: "admin'--",
  path_trav: "../../etc/passwd",
  path_win: "..\\..\\windows\\win.ini",
  nul: "a\u0000b",
  rtl: "‮gnp.exe",
  emoji: "🔥💧🏠",
  zero_width: "a​b﻿c",
  combining: "Z̴̡a̷l̸g̵o̶",
  lone_surrogate: "x\uD800y",
  long100k: "A".repeat(100_000),
  crlf: "a\r\nSet-Cookie: jev=1",
  template: "${7*7}{{7*7}}<%= 7*7 %>",
  proto_obj: PROTO_MARK,
  ctor_obj: CTOR_MARK,
  array: ["a", "b"],
  object: { $ne: null },
  number: 12345,
  float: 1.5,
  negative: -1,
  huge: 1e308,
  bigint_str: "99999999999999999999999",
  nan_str: "NaN",
  inf_str: "Infinity",
  neg_num_str: "-100",
  num_str: "100",
  bool: true,
  null: null,
  empty: "",
  spaces: "   ",
};

export function serialize(body: unknown): string {
  return JSON.stringify(body).split(`"${PROTO_MARK}"`).join(PROTO_JSON).split(`"${CTOR_MARK}"`).join(CTOR_JSON);
}

/** Set a dotted path ("lineItems.0.description") on a fresh copy. */
export function setPath(body: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const keys = path.split(".");
  let cur: any = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === undefined || cur[k] === null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

/** Response text that only a leaked database error or stack trace produces. */
export const ERROR_TEXT =
  /PrismaClient|prisma\.[a-zA-Z]+\.(create|update|find|upsert|delete)|Invalid `|\bP[1-3]\d{3}\b|invocation in|syntax error at or near|relation "[^"]+" does not exist|column "[^"]+" (of relation|does not exist)|violates (not-null|foreign key|unique) constraint|node_modules|\.tsx?:\d+:\d+|\bTypeError\b|\bReferenceError\b|Cannot read propert|\n\s+at [\w$.<>]+ \(/;
