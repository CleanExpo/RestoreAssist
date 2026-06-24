import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// File-convention OG image (Next.js auto-wires <meta property="og:image">).
// Replaces the former square /logo.png reference, which was declared 512×512
// but is actually 940×788 — social cards rendered a small, mis-sized logo.
// Rendered at the canonical 1200×630 for summary_large_image cards.
//
// next/og can't read CSS variables, so the brand palette is inlined here
// (DESIGN.md §2's no-hardcoded-hex rule governs className utilities, not the
// OG renderer). Navy #1C2E47 · bronze #8A6B4E · gold #D4A574.

export const alt = BRAND.meta.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#1C2E47",
          backgroundImage:
            "radial-gradient(circle at 80% 20%, rgba(138,107,78,0.35), transparent 55%)",
          padding: "80px",
          position: "relative",
        }}
      >
        {/* Bronze accent bar — left edge */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "16px",
            backgroundColor: "#8A6B4E",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {BRAND.name}
          </div>

          <div style={{ fontSize: 40, fontWeight: 600, color: "#D4A574" }}>
            {BRAND.tagline}
          </div>

          <div
            style={{
              fontSize: 30,
              color: "rgba(255,255,255,0.82)",
              maxWidth: "880px",
              lineHeight: 1.35,
            }}
          >
            {BRAND.shortDescription}
          </div>
        </div>

        {/* Footer line */}
        <div
          style={{
            position: "absolute",
            left: "80px",
            bottom: "72px",
            fontSize: 24,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          IICRC · WHS · Australian Building Code — built in
        </div>
      </div>
    ),
    { ...size },
  );
}
