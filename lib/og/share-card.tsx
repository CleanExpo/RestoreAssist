import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { ogSize } from "@/lib/og/constants";

// Shared OG / Twitter share card — used by app/opengraph-image.tsx (file
// convention) and app/og/route.tsx (versioned cache-bust URL for crawlers).
// next/og can't read CSS variables, so the brand palette is inlined here
// (DESIGN.md §2's no-hardcoded-hex rule governs className utilities, not the
// OG renderer). Paper #F0F3F6 · navy #0B1F3A · steel #3B6D8C.

export {
  OG_SHARE_PATH,
  ogAlt,
  ogSize,
  ogContentType,
} from "@/lib/og/constants";

export function ShareCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#F0F3F6",
        backgroundImage:
          "linear-gradient(135deg, #F0F3F6 0%, #E4EAF0 55%, #D7E0E8 100%)",
        padding: "72px 80px",
        position: "relative",
      }}
    >
      {/* Steel accent bar — left edge (claim spine) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "12px",
          backgroundColor: "#3B6D8C",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#3B6D8C",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {BRAND.name}
        </div>

        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#0B1F3A",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            maxWidth: "980px",
          }}
        >
          From site to signed report. One system.
        </div>

        <div
          style={{
            fontSize: 30,
            color: "rgba(11,31,58,0.78)",
            maxWidth: "900px",
            lineHeight: 1.4,
            marginTop: "8px",
          }}
        >
          {BRAND.shortDescription}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 24,
          color: "rgba(11,31,58,0.5)",
        }}
      >
        <span>restoreassist.app</span>
        <span>{BRAND.slogan}</span>
      </div>
    </div>
  );
}

export async function createShareOgImage(): Promise<ImageResponse> {
  return new ImageResponse(<ShareCard />, { ...ogSize });
}
