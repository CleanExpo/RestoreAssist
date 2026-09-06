import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const token = (name) => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing colour token: ${name}`);
  return match[1];
};
const luminance = (hex) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4),
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (foreground, background) => {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
};

for (const name of ["brand-cta", "brand-cta-hover", "brand-navy"]) {
  const ratio = contrast("#ffffff", token(name));
  if (ratio < 4.5) {
    console.error(`${name} on white text fails WCAG AA: ${ratio.toFixed(2)}:1`);
    process.exit(1);
  }
}
console.log("Accessibility contrast guard passed for primary action tokens.");
