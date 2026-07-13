import React from "react";
import { RAIcon } from "./RAIcon";
import { parseRATokens } from "@/lib/brand/icon-registry";

export interface RAIconTextProps {
  /** Text that may contain `[ra:name]` tokens. */
  children: string;
  /** Icon pixel size. Defaults to 18. */
  iconSize?: number;
  /** Class on the wrapping element. */
  className?: string;
  /** Class applied to each rendered icon. */
  iconClassName?: string;
  /** Wrapper element tag. Defaults to `span`. */
  as?: "span" | "div" | "p";
}

/**
 * Parses text containing `[ra:name]` tokens and renders branded RestoreAssist
 * icons inline with the surrounding copy. Use this to safely render AI output
 * that follows the no-generic-emojis policy.
 *
 * Unknown tokens are left as literal text (never silently dropped).
 */
export function RAIconText({
  children,
  iconSize = 18,
  className,
  iconClassName,
  as: Tag = "span",
}: RAIconTextProps) {
  const segments = parseRATokens(children ?? "");
  return (
    <Tag className={className}>
      {segments.map((seg, i) =>
        seg.type === "icon" && seg.icon ? (
          <RAIcon
            key={i}
            name={seg.icon}
            size={iconSize}
            className={iconClassName}
          />
        ) : (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ),
      )}
    </Tag>
  );
}

export default RAIconText;
