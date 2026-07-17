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
