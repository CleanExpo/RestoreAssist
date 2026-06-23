import { cn } from "@/lib/utils";
import {
  RA_ICONS,
  raIconSrc,
  type RAIconName,
} from "@/src/brand/restoreassist/icon-registry";

export interface RAIconProps {
  /** Branded icon name (see the RestoreAssist icon registry). */
  name: RAIconName;
  /** Pixel size (width = height). Defaults to 20. */
  size?: number;
  className?: string;
  /** Override the accessible label (defaults to the registry label). */
  title?: string;
  /** Mark purely decorative — removes it from the accessibility tree. */
  decorative?: boolean;
}

/**
 * Renders a single branded RestoreAssist SVG icon from the master assets in
 * `public/brand/restoreassist/icons/svg`. Server- and client-safe (no hooks).
 */
export function RAIcon({
  name,
  size = 20,
  className,
  title,
  decorative = false,
}: RAIconProps) {
  const meta = RA_ICONS[name];
  const label = title ?? meta?.label ?? name;
  return (
    // Inline branded icon sourced from a static SVG — next/image can't flow
    // inline within token text and adds no benefit for a tiny static asset.
    <img
      src={raIconSrc(name)}
      width={size}
      height={size}
      alt={decorative ? "" : label}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn(
        "ra-icon inline-block shrink-0 select-none align-[-0.15em]",
        className,
      )}
    />
  );
}

export default RAIcon;
