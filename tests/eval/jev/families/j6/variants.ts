/**
 * J6 variants: J3's 45 deterministic claims (category 1-3, class 1-4, rooms,
 * line items), plus the site inputs J6 sends so the classification that runs
 * at submit has something to decide. The inputs are shaped toward the J3
 * variant's class (small dry rooms for 1, larger wet rooms for 3, a concrete
 * slab for 4), but the classification oracle never trusts that intent: it
 * recomputes the expected category and class from these inputs alone.
 */
import { variants as j3Variants, WATER_SOURCE, type Variant } from "../j3/variants";

export interface SiteArea {
  room: string;
  areaSqm: number;
  waterSource: string;
  timeSinceLoss: number;
  surfaceType: string;
  moisture: number;
}

export interface J6Variant extends Variant {
  areas: SiteArea[];
  /** Photo bytes this variant uploads: even variants PNG, odd JPEG. */
  photoFormat: "png" | "jpg";
}

const HOURS = [24, 60, 96];

export function j6Variants(): J6Variant[] {
  return j3Variants().map((v, i) => {
    const timeSinceLoss = HOURS[Math.floor(i / 3) % HOURS.length];
    const areas = v.rooms.map((r, k) => {
      const plan = Math.round(r.lengthM * r.widthM * 100) / 100;
      let areaSqm = plan;
      let moisture = v.moisture[k];
      let surfaceType = "Drywall";
      if (v.cls === 1) {
        areaSqm = Math.min(plan, 6 + k);
        moisture = 10 + ((i + k) % 5); // 10..14 %
      } else if (v.cls === 2) {
        areaSqm = Math.min(plan, 30);
        moisture = 16 + ((i + k) % 4); // 16..19 %
      } else if (v.cls === 3) {
        areaSqm = Math.round(plan * 4 * 100) / 100 + 40;
        moisture = 25 + ((i * 3 + k) % 15); // 25..39 %
      } else {
        surfaceType = "Concrete slab";
        moisture = 18 + ((i + k * 5) % 20); // 18..37 %
      }
      return { room: r.name, areaSqm, waterSource: WATER_SOURCE[v.category], timeSinceLoss, surfaceType, moisture };
    });
    return { ...v, areas, photoFormat: i % 2 === 0 ? "png" : "jpg" };
  });
}
