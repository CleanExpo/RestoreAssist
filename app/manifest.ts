import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RestoreAssist - Restoration Report Software",
    short_name: "RestoreAssist",
    // "IICRC S500 compliant" removed. lib/iicrc-inclusion-check.ts documents a
    // hard rule never to assert "complies", "certifies", "meets [the standard]"
    // or "required by law", enforced by a regression test, and full S500 clause
    // ingestion is blocked pending legal clearance. Reports are structured on
    // the standard's sections — that is what can honestly be said. The same
    // correction is already applied to /pricing, /features and the
    // SoftwareApplication schema; a web app manifest is a public claim surface
    // too, and it is the text an installed PWA carries.
    description:
      "AI-assisted restoration report software for Australian water damage and disaster recovery professionals. Reports structured on IICRC S500:2021 sections.",
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
