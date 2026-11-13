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
    <nav className="border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-9xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="RestoreAssist" width={40} height={40} />
            <div>
              <h1 className="text-lg font-bold text-white">Client Portal</h1>
              {clientName && (
                <p className="text-xs text-slate-400">{clientName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/portal"
              className="flex min-h-[44px] items-center gap-2 px-3 py-3 text-sm text-slate-300 transition-colors hover:text-white"
            >
              <FileText size={18} />
              <span className="hidden sm:inline">My Reports</span>
            </Link>
            <Link
              href="/portal/help"
              className="min-h-[44px] px-3 py-3 text-sm text-slate-300 transition-colors hover:text-white"
            >
              Help
            </Link>
            <button
              onClick={handleSignOut}
              className="flex min-h-[44px] items-center gap-2 px-3 py-3 text-sm text-slate-300 transition-colors hover:text-white"
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
