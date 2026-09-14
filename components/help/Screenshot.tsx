import Image from "next/image";
import { tryCloudinaryUrl } from "@/lib/help/cloudinary";

export type ScreenshotProps = {
  src: string;            // Cloudinary public ID, e.g. "ra-help/getting-started/hero"
  alt: string;            // Required for a11y
  caption?: string;
  width?: number;         // Default 1200
};

export default function Screenshot({ src, alt, caption, width = 1200 }: ScreenshotProps) {
  const url = tryCloudinaryUrl(src, { width, quality: "auto", format: "auto" });
  return (
    <figure
      data-testid="help-hero-figure"
      className="my-8 overflow-hidden rounded-lg border border-neutral-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/50"
    >
      {url ? (
        <Image
          src={url}
          alt={alt}
          width={width}
          height={Math.round(width * 0.5625)}
          className="w-full h-auto"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="flex min-h-[180px] items-center justify-center bg-brand-surface px-6 py-10 text-center text-sm text-muted-foreground"
        >
          {alt}
        </div>
      )}
      {caption && (
        <figcaption className="px-4 py-3 text-sm text-muted-foreground border-t border-border">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
