import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Award, MapPin, Star, User, Wrench } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/dashboard/contractors/profile",
    title: "Profile",
    description: "Business identity shown on reports and the client portal.",
    icon: User,
    live: true,
  },
  {
    href: "/dashboard/contractors/certifications",
    title: "Certifications",
    description: "IICRC and licence records for the workspace.",
    icon: Award,
    live: true,
  },
  {
    href: "/dashboard/contractors/service-areas",
    title: "Service areas",
    description: "States and territories you cover.",
    icon: MapPin,
    live: true,
  },
  {
    href: "/dashboard/contractors/reviews",
    title: "Reviews",
    description: "Client feedback attached to this workspace.",
    icon: Star,
    live: true,
  },
  {
    href: "/dashboard/contractors/equipment",
    title: "Equipment",
    description: "Drying kit register is not live in this release.",
    icon: Wrench,
    live: false,
  },
] as const;

export default async function ContractorsHubPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard/contractors");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Contractor workspace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile, licences, coverage and kit for this organisation.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="block">
              <Card className="h-full border-border bg-card transition-colors hover:border-brand-bronze/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-foreground">
                    <Icon className="h-5 w-5 text-brand-gold" />
                    {section.title}
                    {!section.live && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        Coming later
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
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
