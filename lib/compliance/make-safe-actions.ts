// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
export const MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

export type MakeSafeActionName = (typeof MAKE_SAFE_ACTIONS)[number];
