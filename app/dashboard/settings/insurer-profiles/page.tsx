"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Info,
  Loader2,
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsurerProfile {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  requiredEvidenceClasses: string[];
  preferredEvidenceClasses: string[];
  minPhotoCount: number;
  reportFormat: "STANDARD" | "ENHANCED" | "FORENSIC" | "SCOPE_ONLY";
  requiresSignedScope: boolean;
  requiresThirdPartyScope: boolean;
  preferredInvoiceFormat: string | null;
  gstRegistrationRequired: boolean;
  claimsEmailDomain: string | null;
  portalUrl: string | null;
  specialInstructions: string | null;
  iicrcComplianceNote: string | null;
  isActive: boolean;
  isSystemProfile: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEvidenceClass(cls: string): string {
  return cls
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

const REPORT_FORMAT_LABELS: Record<InsurerProfile["reportFormat"], string> = {
  STANDARD: "Standard NIR",
  ENHANCED: "Enhanced Narrative",
  FORENSIC: "Forensic",
  SCOPE_ONLY: "Scope Only",
};

const REPORT_FORMAT_VARIANTS: Record<
  InsurerProfile["reportFormat"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  STANDARD: "secondary",
  ENHANCED: "default",
  FORENSIC: "destructive",
  SCOPE_ONLY: "outline",
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ProfileDetailModal({
  profile,
  onClose,
}: {
  profile: InsurerProfile;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            {profile.name}
          </DialogTitle>
          <DialogDescription>{profile.aliases.join(" · ")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Key flags */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={REPORT_FORMAT_VARIANTS[profile.reportFormat]}>
              {REPORT_FORMAT_LABELS[profile.reportFormat]} Report
            </Badge>
            {profile.requiresSignedScope && (
              <Badge
                variant="outline"
                className="text-amber-700 border-amber-300"
              >
                Signed Scope Required
              </Badge>
            )}
            {profile.requiresThirdPartyScope && (
              <Badge variant="outline" className="text-red-700 border-red-300">
                Independent Scoper Required
              </Badge>
            )}
            {profile.gstRegistrationRequired && (
              <Badge variant="secondary">GST Registration Required</Badge>
            )}
          </div>

          <Separator />

          {/* Evidence requirements */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Evidence Requirements
            </h3>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Required (min {profile.minPhotoCount} total photos)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.requiredEvidenceClasses.map((cls) => (
                  <span
                    key={cls}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-50 text-red-800 border border-red-200"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {formatEvidenceClass(cls)}
                  </span>
                ))}
              </div>
            </div>
            {profile.preferredEvidenceClasses.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  Preferred
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.preferredEvidenceClasses.map((cls) => (
                    <span
                      key={cls}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-800 border border-blue-200"
                    >
                      <Star className="w-3 h-3" />
                      {formatEvidenceClass(cls)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* IICRC note */}
          {profile.iicrcComplianceNote && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                IICRC Compliance Note
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {profile.iicrcComplianceNote}
              </p>
            </div>
          )}

          {/* Special instructions */}
          {profile.specialInstructions && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Info className="w-4 h-4" />
                Special Instructions
              </h3>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 leading-relaxed">
                {profile.specialInstructions}
              </div>
            </div>
          )}

          {/* Contact / portal */}
          {(profile.claimsEmailDomain || profile.portalUrl) && (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Claims Contact</h3>
              {profile.claimsEmailDomain && (
                <p className="text-sm text-muted-foreground">
                  Email domain:{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    @{profile.claimsEmailDomain}
                  </code>
                </p>
              )}
              {profile.portalUrl && (
                <p className="text-sm text-muted-foreground">
                  Portal:{" "}
                  <span className="text-xs font-mono">{profile.portalUrl}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsurerProfilesPage() {
  const [profiles, setProfiles] = useState<InsurerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InsurerProfile | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/insurer-profiles")
      .then((r) => r.json())
      .then((j) => setProfiles(j.data ?? []))
      .catch(() => toast.error("Failed to load insurer profiles"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const system = profiles.filter((p) => p.isSystemProfile);
  const custom = profiles.filter((p) => !p.isSystemProfile);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Insurer Profile Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-insurer evidence and reporting requirements. Reference these when
          setting up a new inspection to ensure your documentation meets each
          insurer's expectations.
        </p>
      </div>

      {/* System profiles */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Australian Insurers
        </h2>
        <div className="border rounded-lg divide-y">
          {system.map((profile) => {
            const isExpanded = expandedId === profile.id;
            return (
              <div key={profile.id}>
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="font-medium text-sm">
                        {profile.name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {profile.aliases.slice(0, 3).join(", ")}
                        {profile.aliases.length > 3 ? " …" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={REPORT_FORMAT_VARIANTS[profile.reportFormat]}
                      className="hidden sm:inline-flex"
                    >
                      {REPORT_FORMAT_LABELS[profile.reportFormat]}
                    </Badge>
                    {profile.requiresThirdPartyScope && (
                      <Badge
                        variant="outline"
                        className="hidden md:inline-flex text-red-700 border-red-300 text-xs"
                      >
                        Ind. Scoper
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(profile);
                      }}
                    >
                      View Details
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Inline summary */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-muted/20 border-t space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Required evidence ({profile.minPhotoCount}+ photos)
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {profile.requiredEvidenceClasses.map((cls) => (
                            <span
                              key={cls}
                              className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200"
                            >
                              {formatEvidenceClass(cls)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Requirements
                        </p>
                        <ul className="text-xs space-y-0.5 text-muted-foreground">
                          <li>
                            {profile.requiresSignedScope ? "✓" : "✗"} Signed
                            scope
                          </li>
                          <li>
                            {profile.requiresThirdPartyScope ? "✓" : "✗"}{" "}
                            Independent scoper
                          </li>
                          <li>
                            {profile.gstRegistrationRequired ? "✓" : "✗"} GST
                            registration
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom profiles */}
      {custom.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Custom Profiles
          </h2>
          <div className="border rounded-lg divide-y">
            {custom.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{profile.name}</span>
                  {!profile.isActive && (
                    <Badge
                      variant="outline"
                      className="text-xs text-muted-foreground"
                    >
                      Inactive
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setSelected(profile)}
                >
                  View Details
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
            <Info className="w-4 h-4" />
            How to use insurer profiles
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-700 space-y-1">
          <p>
            When creating a new inspection, select the relevant insurer to
            pre-load their evidence requirements into the capture workflow. The
            evidence submission gate will validate against the selected
            insurer's required classes before allowing submission.
          </p>
          <p className="text-xs text-blue-600">
            System profiles are maintained by RestoreAssist and kept up to date
            with insurer requirements. Contact support to request a new insurer
            profile.
          </p>
        </CardContent>
      </Card>

      {/* Detail modal */}
      {selected && (
        <ProfileDetailModal
          profile={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
