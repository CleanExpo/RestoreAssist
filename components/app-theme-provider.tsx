"use client";

import type * as React from "react";
import { usePathname } from "next/navigation";

import { ThemeProvider } from "@/components/theme-provider";
import { appThemeProviderProps } from "@/lib/theme/app-theme";

/**
 * Root theme provider (RA-8305). The dashboard follows the user's Appearance
 * choice; public pages stay dark. next-themes renders its own blocking script
 * with these props, so the stored choice is applied before first paint and
 * nothing else may add or remove the `dark` class on <html>.
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ThemeProvider {...appThemeProviderProps(pathname)}>{children}</ThemeProvider>
  );
}
