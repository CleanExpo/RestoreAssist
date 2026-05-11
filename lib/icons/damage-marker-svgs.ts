/**
 * Inline SVG path data for each damage marker type.
 * All paths are designed for a 24×24 viewBox.
 * No external assets — everything is self-contained in this module.
 */

import type { DamageType } from "./damage-marker-types";

/**
 * Map of damage type → SVG path `d` attribute string.
 * Paths use simple geometric symbols to keep the registry dependency-free.
 */
export const DAMAGE_SVG_PATHS: Record<DamageType, string> = {
  // Water drop: teardrop shape
  water: "M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2z",

  // Fire: stylised flame
  fire: "M12 2c0 0-1 4-4 6 0-2-1-4-1-4S4 8 4 13a8 8 0 0 0 16 0c0-5-4-8-4-8s0 2-1 3c-1-2-3-6-3-6z",

  // Mold/biohazard: circle with three overlapping lobes
  mold: "M12 4a3 3 0 1 0 3 3 3 3 0 0 0 1.5 2.6 3 3 0 1 0 0 4.8A3 3 0 1 0 8.5 13.4 3 3 0 1 0 10.5 7 3 3 0 0 0 12 4zm0 7a1 1 0 1 1-1 1 1 1 0 0 1 1-1z",

  // Structural: cracked wall — rectangle with a zigzag crack
  structural: "M3 3h18v18H3V3zm4 4v3l2-1 1 3 2-2 1 3 2-1v-5H7z",

  // Electrical: lightning bolt
  electrical: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",

  // Sewage: circle with wavy lines (biohazard / contamination)
  sewage:
    "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm-4 9c1.1 0 2 .4 2 1s-.9 1-2 1-2-.4-2-1 .9-1 2-1zm8 0c1.1 0 2 .4 2 1s-.9 1-2 1-2-.4-2-1 .9-1 2-1zm-4 5c-2.2 0-4-.9-4-2h8c0 1.1-1.8 2-4 2z",

  // Wind: curved speed lines
  wind: "M4 8h12a2 2 0 0 1 0 4H4m2 4h8a2 2 0 0 1 0 4H6m-2-8h3a2 2 0 0 0 0-4H4",
};
