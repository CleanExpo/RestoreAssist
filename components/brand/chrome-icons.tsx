/**
 * Chrome glyphs — original currentColor SVGs for interface furniture (arrows,
 * close, refresh, status ticks) where the branded RAIcon system does not fit:
 * RAIcon renders fixed brand-palette <img> assets, so it cannot sit inside a
 * coloured status chip or inherit text colour. These glyphs exist so no file
 * needs a generic icon-library import (Phill Rule 1, scripts/check-no-lucide.mjs).
 *
 * Semantic accents (evidence, moisture, report, shield, ...) belong to RAIcon —
 * add here only colour-inheriting furniture, and keep the set small.
 */
import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 24, children, ...props }: GlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChromeArrowLeft(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M20 12H4.5" />
      <path d="M10.5 6 4.5 12l6 6" />
    </Glyph>
  );
}

export function ChromeHome(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m3.5 10.5 8.5-7 8.5 7" />
      <path d="M5.5 9v10.5h13V9" />
      <path d="M9.5 19.5v-6h5v6" />
    </Glyph>
  );
}

export function ChromeChevronRight(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Glyph>
  );
}

export function ChromeRefresh(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.5v4.9h-4.9" />
    </Glyph>
  );
}

export function ChromeEye(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z" />
      <circle cx="12" cy="12" r="2.7" />
    </Glyph>
  );
}

export function ChromePlug(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m8 3 1.5 4.5" />
      <path d="m16 3-1.5 4.5" />
      <path d="M7 7.5h10v2.8a5 5 0 0 1-10 0V7.5z" />
      <path d="M12 15.3V21" />
    </Glyph>
  );
}

export function ChromeX(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5.5 5.5l13 13" />
      <path d="M18.5 5.5l-13 13" />
    </Glyph>
  );
}

export function ChromeCheck(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </Glyph>
  );
}

export function ChromeCheckCircle(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M8 12.4l2.6 2.6 5.4-5.8" />
    </Glyph>
  );
}

export function ChromeAlertCircle(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.6h.01" />
    </Glyph>
  );
}

export function ChromeAlertTriangle(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.8 2.8 19.6a1.2 1.2 0 0 0 1 1.9h16.4a1.2 1.2 0 0 0 1-1.9L12 3.8z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.4h.01" />
    </Glyph>
  );
}

export function ChromeCircle(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9.25" />
    </Glyph>
  );
}

export function ChromeDownload(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 4v11.5" />
      <path d="m6.5 11 5.5 5.5L17.5 11" />
      <path d="M4.5 20h15" />
    </Glyph>
  );
}

export function ChromeCloud(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M17.6 18.5H7a4.2 4.2 0 0 1-.9-8.3 6 6 0 0 1 11.7-1.2 4.8 4.8 0 0 1-.2 9.5z" />
    </Glyph>
  );
}

export function ChromeMail(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </Glyph>
  );
}

export function ChromeChevronDown(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
    </Glyph>
  );
}

export function ChromeExternalLink(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="m19.5 4.5-8 8" />
      <path d="M18 14v4.3a1.2 1.2 0 0 1-1.2 1.2H5.7a1.2 1.2 0 0 1-1.2-1.2V7.2A1.2 1.2 0 0 1 5.7 6H10" />
    </Glyph>
  );
}

export function ChromeBuilding(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M6 20.5V6.2A1.2 1.2 0 0 1 7.2 5h5.6A1.2 1.2 0 0 1 14 6.2v14.3" />
      <path d="M14 10.5h3.8a1.2 1.2 0 0 1 1.2 1.2v8.8" />
      <path d="M8.8 8.5h2.4" />
      <path d="M8.8 12h2.4" />
      <path d="M8.8 15.5h2.4" />
    </Glyph>
  );
}

export function ChromeCamera(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.7 19.5h14.6a1.7 1.7 0 0 0 1.7-1.7V9.2a1.7 1.7 0 0 0-1.7-1.7h-2.4l-1.3-2.2a1.2 1.2 0 0 0-1-.6H9.4a1.2 1.2 0 0 0-1 .6L7.1 7.5H4.7A1.7 1.7 0 0 0 3 9.2v8.6a1.7 1.7 0 0 0 1.7 1.7z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </Glyph>
  );
}

export function ChromeMapPin(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M19 10.3c0 5-7 11.2-7 11.2s-7-6.2-7-11.2a7 7 0 0 1 14 0z" />
      <circle cx="12" cy="10.2" r="2.6" />
    </Glyph>
  );
}

export function ChromeDroplet(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.5s6 6.1 6 10.1a6 6 0 0 1-12 0c0-4 6-10.1 6-10.1z" />
    </Glyph>
  );
}

export function ChromeRuler(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m15.6 3.6 4.8 4.8a1.2 1.2 0 0 1 0 1.7L9.6 20.9a1.2 1.2 0 0 1-1.7 0l-4.8-4.8a1.2 1.2 0 0 1 0-1.7L13.9 3.6a1.2 1.2 0 0 1 1.7 0z" />
      <path d="m8.5 9 2 2" />
      <path d="m11.5 6 2 2" />
      <path d="m5.5 12 2 2" />
    </Glyph>
  );
}

export function ChromeScanLine(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 8V6.2A2.2 2.2 0 0 1 6.2 4H8" />
      <path d="M16 4h1.8A2.2 2.2 0 0 1 20 6.2V8" />
      <path d="M20 16v1.8a2.2 2.2 0 0 1-2.2 2.2H16" />
      <path d="M8 20H6.2A2.2 2.2 0 0 1 4 17.8V16" />
      <path d="M4.5 12h15" />
    </Glyph>
  );
}

/**
 * Indeterminate spinner. An open arc, not a full circle — the gap is what makes
 * rotation legible, so this only reads as "busy" with `animate-spin` applied.
 */
export function ChromeSpinner(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </Glyph>
  );
}
