"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function ContractorsBackLink() {
  return (
    <Link
      href="/dashboard/contractors"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Contractor workspace
    </Link>
  );
}
