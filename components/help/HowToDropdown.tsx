"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronDown,
  BookOpen,
  Camera,
  FileText,
  Users,
  CreditCard,
  UserPlus,
  Plug,
  ShieldCheck,
} from "lucide-react";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";

const CATEGORY_ICONS: Record<HelpCategory, React.ReactNode> = {
  "getting-started": <BookOpen className="h-5 w-5" />,
  inspections: <Camera className="h-5 w-5" />,
  reports: <FileText className="h-5 w-5" />,
  "clients-and-portal": <Users className="h-5 w-5" />,
  billing: <CreditCard className="h-5 w-5" />,
  team: <UserPlus className="h-5 w-5" />,
  integrations: <Plug className="h-5 w-5" />,
  compliance: <ShieldCheck className="h-5 w-5" />,
};

const CATEGORY_DESCRIPTIONS: Record<HelpCategory, string> = {
  "getting-started": "Signup, setup, first inspection",
  inspections: "Photos, sign-off, claim types",
  reports: "AI-drafted S500 reports, exports",
  "clients-and-portal": "Share reports, manage clients",
  billing: "Plans, upgrades, invoices",
  team: "Invite technicians, licences",
  integrations: "Xero, MYOB, QB, Drive",
  compliance: "IICRC standards, WHS",
};

export default function HowToDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/5 min-h-[44px]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        How To
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[520px] rounded-lg border border-white/10 bg-[#0E1320] p-4 shadow-xl shadow-black/50"
        >
          <div className="grid grid-cols-2 gap-2">
            {HELP_CATEGORIES.map((cat) => (
              <Link
                key={cat}
                href={`/dashboard/help/${cat}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 rounded-md p-3 hover:bg-white/5 min-h-[44px]"
              >
                <div className="text-white/70">{CATEGORY_ICONS[cat]}</div>
                <div>
                  <div className="text-sm font-medium text-white">
                    {HELP_CATEGORY_LABELS[cat]}
                  </div>
                  <div className="text-xs text-white/60">
                    {CATEGORY_DESCRIPTIONS[cat]}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3 border-t border-white/10 pt-3 text-center">
            <Link
              href="/dashboard/help"
              onClick={() => setOpen(false)}
              className="text-sm text-[#D4A574] hover:text-[#E6BB8E]"
            >
              Browse all articles →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
