"use client";

/**
 * Social training workspace — Phil's restoration relevance rule, gate tester,
 * copyable role prompt, and one-click chat drills.
 */

import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";
import { SocialRelevanceTester } from "@/components/margot/SocialRelevanceTester";
import { SocialRolePromptCard } from "@/components/margot/SocialRolePromptCard";
import { MARGOT_SOCIAL_TRAINING_CHECKS } from "@/lib/margot/social-role-prompt";
import { PROPERTY_RESTORATION_DEFINITION } from "@/lib/margot/social-restoration-relevance";

export default function MargotSocialTrainingPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-foreground">
            Social comment training
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reign in false &quot;restoration&quot; replies. Only engage when the
            post is property or insurance restoration for RestoreAssist.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/margot">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Test in chat
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardPanel>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Engage</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Water, flood, storm, fire/smoke, mould, sewage, biohazard,
                IICRC, drying, claims, building remediation.
              </p>
            </div>
          </div>
        </DashboardPanel>
        <DashboardPanel>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300">
              <Ban className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Ignore</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cars, utes, trucks, teeth/dental, furniture, art, hair, film,
                watches, data restore, habitat — and bare &quot;restoration&quot;.
              </p>
            </div>
          </div>
        </DashboardPanel>
        <DashboardPanel>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200">
              <HelpCircle className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Unsure</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Mixed signals or unclear posts — fail closed. Do not comment.
              </p>
            </div>
          </div>
        </DashboardPanel>
      </div>

      <DashboardPanel>
        <DashboardPanelHeader
          title="What restoration means for us"
          description="Canonical definition used by the gate, chat, Hermes, and public orb."
        />
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {PROPERTY_RESTORATION_DEFINITION}
        </p>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Badge variant="secondary" className="shrink-0 font-normal">
              Drafts
            </Badge>
            Human tone, 1–3 short sentences, no apostrophes or fancy dashes
          </li>
          <li className="flex gap-2">
            <Badge variant="secondary" className="shrink-0 font-normal">
              Refuse
            </Badge>
            One short skip line + our definition — no sales pitch
          </li>
        </ul>
      </DashboardPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <SocialRelevanceTester />
        <div className="space-y-4">
          <SocialRolePromptCard />
          <DashboardPanel>
            <DashboardPanelHeader
              title="Chat drills"
              description="Send these into Margot chat to verify refuse vs engage."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/margot">
                    Open chat
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
            <ul className="space-y-2">
              {MARGOT_SOCIAL_TRAINING_CHECKS.map((item) => (
                <li key={item.label}>
                  <Link
                    href={`/dashboard/margot?q=${encodeURIComponent(item.prompt)}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm transition-colors hover:bg-neutral-50 dark:border-slate-700/60 dark:hover:bg-slate-900/50"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.prompt}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        item.expect === "refuse"
                          ? "shrink-0 border-rose-500/30 text-rose-700 dark:text-rose-300"
                          : "shrink-0 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {item.expect}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardPanel>
        </div>
      </div>
    </div>
  );
}
