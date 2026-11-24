"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** Where the customer lands after signing in. Must be a same-site path. */
  callbackUrl?: string;
  label?: string;
  className?: string;
};

/**
 * The one sign-in prompt for a session that has ended. A real button, not
 * link text, in the brand call-to-action colour (white on brand-cta, 8.63:1).
 */
export function SignInAgainButton({
  callbackUrl = "/dashboard",
  label = "Sign in again",
  className,
}: Props) {
  return (
    <Button
      asChild
      size="touch"
      className={cn(
        "bg-brand-cta text-white hover:bg-brand-cta/90 hover:shadow-md",
        className,
      )}
    >
      <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
        {label}
      </Link>
    </Button>
  );
}
