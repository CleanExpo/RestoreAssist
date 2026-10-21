/**
 * J1 planted defects. Each is a route the J1 verdict must FAIL; a control
 * still PASS means the detector is broken (BROKEN_CHECK) and the run fails.
 */
import type { Method, RouteInfo } from "../../runner/route-harness";
import type { IdentityName } from "../../runner/world";

const P = "tests/eval/jev/families/j1/planted-routes";

export const PLANTED: Array<{
  id: string;
  info: Pick<RouteInfo, "file" | "route" | "params">;
  method: Method;
  who: IdentityName;
  payload: "empty" | "malformed" | "swap";
}> = [
  // Echoes firm A's record to whoever asks: the leak oracle must fire.
  { id: "J1-CTRL-leak", info: { file: `${P}/leak.ts`, route: "/api/jev-planted/leak/[id]", params: ["id"] }, method: "GET", who: "B_OWNER", payload: "empty" },
  // Answers 200 with no session check: the signed-out rule must fire.
  { id: "J1-CTRL-anon", info: { file: `${P}/anon.ts`, route: "/api/jev-planted/anon", params: [] }, method: "GET", who: "anon", payload: "empty" },
  // Accepts firm B's write on a firm A record.
  { id: "J1-CTRL-xwrite", info: { file: `${P}/xwrite.ts`, route: "/api/jev-planted/xwrite/[id]", params: ["id"] }, method: "PATCH", who: "B_TECH", payload: "swap" },
  // Returns 500 on malformed JSON instead of 400.
  // Keeps the honest-503 exemption narrow: an opaque 503 must still fail.
  { id: "J1-CTRL-opaque503", info: { file: `${P}/opaque503.ts`, route: "/api/jev-planted/opaque503", params: [] }, method: "GET", who: "A_OWNER", payload: "empty" },
  // Lets the JSON parse error escape the handler.
  { id: "J1-CTRL-throw", info: { file: `${P}/throw.ts`, route: "/api/jev-planted/throw", params: [] }, method: "POST", who: "A_OWNER", payload: "malformed" },
  { id: "J1-CTRL-crash", info: { file: `${P}/crash.ts`, route: "/api/jev-planted/crash", params: [] }, method: "POST", who: "A_OWNER", payload: "malformed" },
];
