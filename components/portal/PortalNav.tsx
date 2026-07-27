"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, FileText } from "lucide-react";
import {
  clearClientToken,
  getStoredClientSession,
} from "@/lib/portal/client-session";

export default function PortalNav() {
  const router = useRouter();
  const [clientName, setClientName] = useState<string | null>(null);

  useEffect(() => {
    setClientName(getStoredClientSession()?.name ?? null);
  }, []);

  const handleSignOut = () => {
    clearClientToken();
    router.push("/portal/login");
  };

  return (
    <nav className="bg-white border-b border-brand-slate/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="RestoreAssist" width={40} height={40} />
            <div>
              <h1 className="text-lg font-bold text-brand-navy">
                Client Portal
              </h1>
              {clientName && (
                <p className="text-xs text-brand-slate">{clientName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/portal"
              className="flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm text-brand-slate hover:text-brand-navy transition-colors"
            >
              <FileText size={18} />
              <span className="hidden sm:inline">My Reports</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm text-brand-slate hover:text-brand-navy transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
