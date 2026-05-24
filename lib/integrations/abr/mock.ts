import { parseAbrResponse, type ParseResult } from "./parse";
import company from "./__fixtures__/company.json";
import soleTrader from "./__fixtures__/sole-trader.json";
import noRecord from "./__fixtures__/no-record.json";

const REGISTRY: Record<string, unknown> = {
  "53004085616": company,
  "11111111111": soleTrader,
  "00000000000": noRecord,
};

export function mockLookupAbn(abn: string): ParseResult {
  const raw = REGISTRY[abn];
  if (!raw) return { ok: false, reason: "NO_RECORD" };
  return parseAbrResponse(raw);
}
