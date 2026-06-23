import Image from "next/image";
import { cloudinaryUrl } from "@/lib/help/cloudinary";

export type ScreenshotProps = {
  src: string;            // Cloudinary public ID, e.g. "ra-help/getting-started/hero"
  alt: string;            // Required for a11y
  caption?: string;
  width?: number;         // Default 1200
};

export default function Screenshot({ src, alt, caption, width = 1200 }: ScreenshotProps) {
  const url = cloudinaryUrl(src, { width, quality: "auto", format: "auto" });
  return (
    <figure className="my-8 overflow-hidden rounded-lg border border-white/10 bg-brand-surface">
      <Image
        src={url}
        alt={alt}
        width={width}
        height={Math.round(width * 0.5625)}
        className="w-full h-auto"
      />
      {caption && (
        <figcaption className="px-4 py-3 text-sm text-white/60 border-t border-white/10">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
