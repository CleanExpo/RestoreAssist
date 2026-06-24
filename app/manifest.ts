import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RestoreAssist - Restoration Report Software",
    short_name: "RestoreAssist",
    description:
      "AI-powered restoration report software for Australian water damage and disaster recovery professionals. IICRC S500 compliant.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1C2E47",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Dedicated maskable variant: logo padded into the 40%-radius safe
        // zone on an opaque background so Android adaptive masks don't crop it.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "productivity", "utilities"],
    lang: "en-AU",
  };
}
