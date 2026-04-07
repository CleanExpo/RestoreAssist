"use client";

/**
 * RA-440: Mobile bottom navigation bar.
 * Shown on small screens only (md:hidden). Provides quick access to the
 * five most-used field functions without navigating away from the inspection.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Droplets,
  Mic,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  inspectionId?: string;
}

export function MobileNav({ inspectionId }: MobileNavProps) {
  const pathname = usePathname();

  const items = inspectionId
    ? [
        {
          label: "Overview",
          icon: LayoutDashboard,
          href: `/dashboard/inspections/${inspectionId}`,
          exact: true,
        },
        {
          label: "Readings",
          icon: Droplets,
          href: `/dashboard/inspections/${inspectionId}/field`,
        },
        {
          label: "Photos",
          icon: Camera,
          href: `/dashboard/inspections/${inspectionId}/photos`,
        },
        {
          label: "Voice",
          icon: Mic,
          href: `/dashboard/inspections/${inspectionId}/voice`,
        },
        {
          label: "Checklist",
          icon: ClipboardList,
          href: `/dashboard/inspections/${inspectionId}/field#checklist`,
        },
      ]
    : [
        {
          label: "Jobs",
          icon: ClipboardList,
          href: "/dashboard/inspections",
          exact: false,
        },
        {
          label: "Field",
          icon: Droplets,
          href: "/dashboard/field",
          exact: false,
        },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#050505] border-t border-white/10 safe-area-bottom">
      <div className="flex items-stretch h-16">
        {items.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href.split("#")[0]);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-xs transition-colors",
                isActive
                  ? "text-[#D4A574]"
                  : "text-white/40 hover:text-white/70",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
