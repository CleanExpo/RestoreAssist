/**
 * IICRC Reviewer Prompts panel (RA-5040 PR1).
 *
 * Renders the missing inclusion-check prompts from
 * lib/iicrc-inclusion-check.ts, grouped by severity: "flag" prompts under
 * "Required consideration", "reminder" prompts under "Reminder". This is
 * informational only — it never blocks save, sync, or export, and it
 * renders nothing when there is nothing to show.
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InclusionPrompt } from "@/lib/iicrc-inclusion-check";

interface IicrcInclusionPanelProps {
  claimType: string;
  missingPrompts: readonly InclusionPrompt[];
}

export default function IicrcInclusionPanel({
  claimType,
  missingPrompts,
}: IicrcInclusionPanelProps) {
  if (missingPrompts.length === 0) return null;

  const requiredConsideration = missingPrompts.filter(
    (p) => p.severity === "flag",
  );
  const reminders = missingPrompts.filter((p) => p.severity === "reminder");

  return (
    <Card
      data-testid="iicrc-inclusion-panel"
      className="border-[#8A6B4E]/40 print:hidden"
    >
      <CardHeader>
        <CardTitle className="text-sm">
          IICRC Reviewer Prompts{claimType ? ` — ${claimType}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Informational only — these prompts do not block save, sync, or
          export.
        </p>

        {requiredConsideration.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Required consideration
            </p>
            {requiredConsideration.map((p) => (
              <div key={p.id} className="flex items-start gap-2 text-sm">
                <Badge variant="secondary">flag</Badge>
                <span>{p.prompt}</span>
              </div>
            ))}
          </div>
        )}

        {reminders.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reminder
            </p>
            {reminders.map((p) => (
              <div key={p.id} className="flex items-start gap-2 text-sm">
                <Badge variant="outline">reminder</Badge>
                <span>{p.prompt}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
