"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({ email, name, organizationId, businessName, onLogout, busy }: {
  email: string;
  name?: string | null;
  organizationId?: string | null;
  businessName?: string | null;
  onLogout: () => void;
  busy: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Account and workspace" className="rounded-full">
          {name?.charAt(0) || "U"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="space-y-1 whitespace-normal">
          <p>Signed in as</p>
          <p className="break-all font-normal">{email}</p>
          {businessName && <p className="font-normal">Business: {businessName}</p>}
          <p className="break-all text-xs font-normal">
            {organizationId ? `Organisation: ${organizationId}` : "Personal account — no organisation linked"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/login?switchAccount=google">Use another Google account</a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLogout} disabled={busy}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
