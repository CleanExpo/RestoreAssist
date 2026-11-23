import { describe, expect, it } from "vitest";
import { contrast, hexToRgb, over, resolve } from "./support/wcag-contrast";
import {
  colourLiterals,
  readColour,
  readSize,
  scanSource,
} from "./support/jsx-surface-contrast";

/**
 * RA-8549 (RA-4868 follow-up). Proves the surface-aware contrast guard on
 * planted sources: it fails on the two home-page numerals as they were, passes
 * their fixed twins, and catches low-contrast text that the old guard's fixed
 * list of navy-band colours let through.
 */

/**
 * The RA-4868 guard as it was on main 45c284776: a text colour on the list is
 * measured against brand-navy, anything else against #F0F3F6, unless the same
 * class string sets a solid `bg-`. Kept here only to show what it missed.
 */
const ON_DARK_BAND = new Set([
  "white",
  "[#7ba3bd]",
  "[#8fb2c9]",
  "[#a8c5d8]",
  "brand-gold",
  "brand-gold-hover",
  "brand-harbour-light",
]);

function legacyScan(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const classes = (m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean);
    const fill = classes
      .map((c) => c.match(/^bg-(.+)$/)?.[1])
      .map((c) => (c ? readColour(c) : null))
      .find((c) => c && c.alpha === 1);
    for (const cls of classes) {
      const t = cls.match(/^text-(.+)$/);
      const text = t ? readColour(t[1]) : null;
      if (!text) continue;
      const surface =
        fill?.rgb ??
        (ON_DARK_BAND.has(text.name)
          ? resolve("brand-navy")
          : hexToRgb("#F0F3F6"));
      if (contrast(over(text.rgb, text.alpha, surface), surface) < 4.5)
        out.push(cls);
    }
  }
  return out;
}

const NAVY_HEX = `#${resolve("brand-navy")
  .map((v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0"),
  )
  .join("")}`;

const scan = (src: string) =>
  scanSource(src, "planted.tsx").findings.map((f) => f.cls);

/** The two numerals as they were on main, in their real sections. */
const NUMERALS_BEFORE = `
const FONT_DISPLAY = "font-[family-name:var(--font-landing-display)]";
export function Planted() {
  return (
    <div className="relative bg-[#F0F3F6] text-brand-navy">
      <section id="workflow" className="scroll-mt-24 py-28 sm:py-36">
        <span
          className={\`\${FONT_DISPLAY} select-none text-[clamp(4.5rem,14vw,9rem)] font-bold leading-[0.8] tracking-[-0.06em] text-brand-harbour/20\`}
          aria-hidden
        >01</span>
      </section>
      <section id="damage" className="scroll-mt-24 border-y border-brand-navy/10 bg-white py-28 sm:py-36">
        <li className="group grid gap-4 border-t border-brand-navy/10 py-10 transition-colors hover:bg-[#F0F3F6]/80">
          <span className={\`\${FONT_DISPLAY} text-2xl font-bold text-brand-harbour/35 transition-colors group-hover:text-brand-harbour\`}>01</span>
        </li>
      </section>
    </div>
  );
}
`;

const NUMERALS_AFTER = NUMERALS_BEFORE.replace(
  "text-brand-harbour/20",
  "text-brand-harbour/65",
).replace("text-brand-harbour/35", "text-brand-harbour/65");

describe("RA-8549 surface-aware public contrast guard", () => {
  it("fails on the two home-page numerals as they were", () => {
    const findings = scanSource(NUMERALS_BEFORE, "planted.tsx").findings;
    expect(
      findings.map((f) => [
        f.cls,
        f.surface,
        f.required,
        Number(f.ratio.toFixed(2)),
      ]),
    ).toEqual([
      // axe-core measured these on / at 1440 and 390 wide: 1.4:1 and 1.92:1.
      ["text-brand-harbour/20", "#f0f3f6", 3, 1.41],
      ["text-brand-harbour/35", "#ffffff", 3, 1.92],
    ]);
  });

  it("passes the fixed twin (brand-harbour/65, large text, 3:1)", () => {
    expect(scan(NUMERALS_AFTER)).toEqual([]);
  });

  it("catches a navy-band colour placed on a light surface; the old list did not", () => {
    const src = `export const P = () => (
      <section className="bg-brand-navy">
        <p className="text-[#A8C5D8]">On the band: fine.</p>
      </section>
    );
    export const Q = () => (
      <section className="bg-white">
        <p className="text-[#A8C5D8]">Moved onto a light section.</p>
      </section>
    );`;
    expect(legacyScan(src)).toEqual([]);
    const findings = scanSource(src, "planted.tsx").findings;
    expect(findings.map((f) => [f.cls, f.surface])).toEqual([
      ["text-[#A8C5D8]", "#ffffff"],
    ]);
  });

  it("catches a new low-contrast element on the navy band; the old list did not", () => {
    // brand-steel is not on the old list, so the old guard measured it against
    // the light canvas (where it passes) even though it sits on brand-navy.
    const src = `export const Band = () => (
      <section className="scroll-mt-24 overflow-hidden bg-brand-navy text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-[13px] text-white/75">Muted copy that passes.</p>
          <p className="text-[13px] text-brand-steel">New caption that does not.</p>
        </div>
      </section>
    );`;
    expect(legacyScan(src)).toEqual([]);
    const findings = scanSource(src, "planted.tsx").findings;
    expect(findings.map((f) => f.cls)).toEqual(["text-brand-steel"]);
    expect(findings[0].surface).toBe(NAVY_HEX);
    expect(findings[0].ratio).toBeLessThan(4.5);
  });

  it("measures a clean band and a clean light section as passing", () => {
    const src = `export const Clean = () => (
      <div className="bg-[#F0F3F6]">
        <section className="bg-brand-navy"><p className="text-white/75">a</p><p className="text-[#A8C5D8]">b</p></section>
        <section className="bg-white"><p className="text-slate-600">c</p><p className="text-brand-navy">d</p></section>
      </div>
    );`;
    const r = scanSource(src, "planted.tsx");
    expect(r.findings).toEqual([]);
    expect(r.measured).toBe(4);
  });

  it("composites a translucent fill over the surface beneath it", () => {
    // white/85 over navy is nearly white, so white text on it fails.
    const src = `export const X = () => (
      <section className="bg-brand-navy"><div className="bg-white/85"><p className="text-white">x</p></div></section>
    );`;
    expect(scan(src)).toEqual(["text-white"]);
  });

  it("pairs a conditional fill with the text in the same branch", () => {
    const src = `export const X = ({ on }: { on: boolean }) => (
      <button className={cn("rounded-xl px-3", on ? "bg-brand-navy text-white" : "bg-white text-brand-navy")}>x</button>
    );`;
    expect(scan(src)).toEqual([]);
  });

  it("resolves class constants so a template literal is measured", () => {
    const src = `const LOW = "text-slate-300";
    export const X = () => <section className="bg-white"><p className={\`\${LOW} mt-2\`}>x</p></section>;`;
    expect(scan(src)).toEqual(["text-slate-300"]);
  });

  it("reports a class string it cannot place on a surface", () => {
    // An indexed lookup is not resolved, so the string is not measured; the
    // public guard fails on any such string rather than passing it quietly.
    const src = `const TONE = { a: "text-slate-300", b: "text-brand-navy" } as Record<string, string>;
    export const X = ({ k }: { k: string }) => <p className={TONE[k]}>x</p>;`;
    const { used } = scanSource(src, "planted.tsx");
    const unplaced = colourLiterals(src, "planted.tsx").filter(
      (l) => !used.has(l.id),
    );
    expect(unplaced.map((l) => l.text)).toEqual([
      "text-slate-300",
      "text-brand-navy",
    ]);
  });

  it("uses 3:1 only for large text", () => {
    // brand-harbour/65 on white is about 3.8:1: enough at 24px, not at 14px.
    const big = `export const X = () => <section className="bg-white"><p className="text-2xl text-brand-harbour/65">x</p></section>;`;
    const small = big.replace("text-2xl", "text-sm");
    const boldish = big.replace("text-2xl", "text-[19px] font-bold");
    const semibold = big.replace("text-2xl", "text-[19px] font-semibold");
    expect(scan(big)).toEqual([]);
    expect(scan(small)).toEqual(["text-brand-harbour/65"]);
    expect(scan(boldish)).toEqual([]);
    expect(scan(semibold)).toEqual(["text-brand-harbour/65"]);
  });

  it("reads font sizes the way the smallest viewport renders them", () => {
    expect(readSize("text-2xl")).toBe(24);
    expect(readSize("text-sm/6")).toBe(14);
    expect(readSize("text-[15px]")).toBe(15);
    expect(readSize("text-[1.9rem]")).toBe(30.4);
    expect(readSize("text-[clamp(4.5rem,14vw,9rem)]")).toBe(72);
    expect(readSize("text-brand-navy")).toBeNull();
  });
});
