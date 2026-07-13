"use client";

/**
 * Equipment register UI was built ahead of its API.
 * `/api/contractors/equipment` does not exist (the path is captured by
 * `/api/contractors/[slug]`), so this page must not pretend CRUD works.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EquipmentPage() {
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          asChild
          className="border-slate-600 text-slate-300"
        >
          <Link href="/dashboard/contractors">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Wrench className="h-6 w-6 text-cyan-400" />
          Equipment
        </h1>
      </div>

      <Card className="bg-slate-800/40 border-amber-500/40">
        <CardHeader>
          <CardTitle className="text-amber-300 flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5" />
            Not available in this release
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>
            The equipment and calibration register UI is not wired to a
            dedicated API yet. Creating or editing gear here would not persist
            correctly.
          </p>
          <p className="text-slate-400">
            Track moisture meters and drying kit against the job in Field Mode
            and inspection photos until the equipment API ships.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild className="bg-cyan-500 hover:bg-cyan-600 text-white">
              <Link href="/dashboard/field">Open Field Mode</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-slate-600 text-slate-300"
            >
              <Link href="/dashboard/contractors">Contractor profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
