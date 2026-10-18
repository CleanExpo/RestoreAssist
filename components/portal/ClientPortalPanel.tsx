import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

export function ClientPortalPanel({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & ComponentProps<"div">) {
  return (
    <div className={cn(clientPortalPanelPadding, className)} {...rest}>
      {children}
    </div>
  );
}
