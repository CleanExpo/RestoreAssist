// File-convention OG image (Next.js auto-wires <meta property="og:image">
// when metadata.images is omitted). Kept in sync with /og via shared module.
export {
  createShareOgImage as default,
  ogAlt as alt,
  ogSize as size,
  ogContentType as contentType,
} from "@/lib/og/share-card";
