/**
 * Typed-signature image generator (client portal Phase 3b).
 *
 * Turns a client's typed full name into a signature image data URL that the
 * existing authority-sign route stores as `signatureData`. Uses an inline SVG
 * (no <canvas>, so it's deterministic + works server- or client-side and is
 * trivially testable). The legal capture (IP/UA, timestamp, atomic completion)
 * is handled by the sign route — this only produces the visual mark.
 */

export function typedSignatureDataUrl(name: string): string {
  const safe =
    name
      .replace(/[<>&"']/g, "")
      .trim()
      .slice(0, 80) || "Signed";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80">` +
    `<text x="12" y="52" font-family="'Brush Script MT',cursive" font-size="34" font-style="italic" fill="#0f172a">${safe}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
