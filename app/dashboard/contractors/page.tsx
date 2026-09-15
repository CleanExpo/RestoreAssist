"use client";

/**
 * RA-7452 — hub for /dashboard/contractors.
 * Child routes existed without an index, so Back from Equipment 404'd.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Award,
  MapPin,
  Star,
  User,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/dashboard/contractors/profile",
    title: "Profile",
    description: "Business identity shown on reports and the client portal.",
    icon: User,
  },
  {
    href: "/dashboard/contractors/certifications",
    title: "Certifications",
    description: "IICRC and licence records for the workspace.",
    icon: Award,
  },
  {
    href: "/dashboard/contractors/service-areas",
    title: "Service areas",
    description: "States and territories you cover.",
    icon: MapPin,
  },
  {
    href: "/dashboard/contractors/reviews",
    title: "Reviews",
    description: "Client feedback attached to this workspace.",
    icon: Star,
  },
  {
    href: "/dashboard/contractors/equipment",
    title: "Equipment",
    description: "Drying kit and meter register (API not wired yet).",
    icon: Wrench,
  },
] as const;

export default function ContractorsHubPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Contractor workspace</h1>
        <p className="text-sm text-slate-400 mt-1">
          Profile, licences, coverage and kit for this organisation.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="block">
              <Card className="h-full bg-slate-800/40 border-slate-700 hover:border-cyan-500/40 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <Icon className="h-5 w-5 text-cyan-400" />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-400">
                  {section.description}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
