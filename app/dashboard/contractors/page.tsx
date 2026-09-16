import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SVGProps } from "react";
import { ChromeMapPin } from "@/components/brand/chrome-icons";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Inline SVG marks (Phill Rule 1: no generic icon-library imports). RAIcon is
// the wrong tool here — it renders fixed brand-palette <img> assets and cannot
// inherit `text-brand-gold` from the call site, and its registry carries no
// award/star/user/wrench names. chrome-icons.tsx supplies ChromeMapPin; the
// four below have no chrome equivalent and, per .claude/DESIGN.md, app-level
// code defines the mark it needs in the component that uses it rather than
// growing a shared module that asks to be kept small.
type MarkProps = SVGProps<SVGSVGElement> & { size?: number };

function Mark({ size = 24, children, ...props }: MarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function UserMark(props: MarkProps) {
  return (
    <Mark {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Mark>
  );
}

function AwardMark(props: MarkProps) {
  return (
    <Mark {...props}>
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      <circle cx="12" cy="8" r="6" />
    </Mark>
  );
}

function StarMark(props: MarkProps) {
  return (
    <Mark {...props}>
      <path d="M12 2.5l2.9 5.88 6.5.95-4.7 4.58 1.11 6.47L12 17.33l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95z" />
    </Mark>
  );
}

function WrenchMark(props: MarkProps) {
  return (
    <Mark {...props}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3L16.7 8.3" />
      <path d="M14.7 6.3 18 3l3 3-3.3 3.3" />
    </Mark>
  );
}

const SECTIONS = [
  {
    href: "/dashboard/contractors/profile",
    title: "Profile",
    description: "Business identity shown on reports and the client portal.",
    icon: UserMark,
    live: true,
  },
  {
    href: "/dashboard/contractors/certifications",
    title: "Certifications",
    description: "IICRC and licence records for the workspace.",
    icon: AwardMark,
    live: true,
  },
  {
    href: "/dashboard/contractors/service-areas",
    title: "Service areas",
    description: "States and territories you cover.",
    icon: ChromeMapPin,
    live: true,
  },
  {
    href: "/dashboard/contractors/reviews",
    title: "Reviews",
    description: "Client feedback attached to this workspace.",
    icon: StarMark,
    live: true,
  },
  {
    href: "/dashboard/contractors/equipment",
    title: "Equipment",
    description: "Drying kit register is not live in this release.",
    icon: WrenchMark,
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
