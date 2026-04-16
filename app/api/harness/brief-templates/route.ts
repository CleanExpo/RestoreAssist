/**
 * GET /api/harness/brief-templates
 *
 * Returns the three brief template tiers (basic | detailed | advanced)
 * for use by dashboard UI and Pi-CEO pipeline consumers.
 *
 * Auth: requires active session.
 *
 * Query params:
 *   tier  — filter to a specific tier (basic | detailed | advanced)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── Template definitions ───────────────────────────────────────────────────
// Kept in-module to avoid filesystem reads in serverless — templates are
// static and don't change between requests.

interface BriefField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "array" | "boolean";
  required: boolean;
  placeholder?: string;
  options?: string[];
  hint?: string;
}

interface BriefTemplate {
  tier: "basic" | "detailed" | "advanced";
  label: string;
  description: string;
  estimatedTime: string;
  fields: BriefField[];
}

const TEMPLATES: BriefTemplate[] = [
  {
    tier: "basic",
    label: "BasicBrief",
    description: "Start here. 3 fields — the pipeline fills the rest.",
    estimatedTime: "~30 seconds",
    fields: [
      {
        name: "title",
        label: "What do you want built?",
        type: "text",
        required: true,
        placeholder: "Add dark mode toggle",
        hint: "One sentence describing the feature or fix.",
      },
      {
        name: "description",
        label: "Why is it needed?",
        type: "textarea",
        required: true,
        placeholder:
          "Users want to switch between light and dark themes to reduce eye strain.",
        hint: "2-3 sentences explaining the problem it solves.",
      },
      {
        name: "repo",
        label: "Target repository",
        type: "text",
        required: true,
        placeholder: "CleanExpo/ccw-crm",
        hint: "GitHub repo slug or full URL.",
      },
    ],
  },
  {
    tier: "detailed",
    label: "DetailedBrief",
    description:
      "Add acceptance criteria and guard-rails. Produces better quality.",
    estimatedTime: "~2 minutes",
    fields: [
      {
        name: "title",
        label: "What do you want built?",
        type: "text",
        required: true,
        placeholder: "Add dark mode toggle",
      },
      {
        name: "description",
        label: "Why is it needed?",
        type: "textarea",
        required: true,
        placeholder: "Users want to switch between light and dark themes.",
      },
      {
        name: "repo",
        label: "Target repository",
        type: "text",
        required: true,
        placeholder: "CleanExpo/ccw-crm",
      },
      {
        name: "intent_type",
        label: "Task type",
        type: "select",
        required: true,
        options: ["feature", "bugfix", "chore", "hotfix", "spike"],
      },
      {
        name: "acceptance_criteria",
        label: "Done when…",
        type: "textarea",
        required: true,
        placeholder:
          "Toggle persists after page reload. Works on mobile viewport.",
        hint: "Specific, testable conditions that must be true when complete.",
      },
      {
        name: "do_not_break",
        label: "Must not break",
        type: "text",
        required: true,
        placeholder: "Login flow, dashboard charts, PDF export",
        hint: "Existing functionality that must not regress.",
      },
    ],
  },
  {
    tier: "advanced",
    label: "AdvancedBrief",
    description:
      "Full pipeline control — eval threshold, budget, target files.",
    estimatedTime: "~5 minutes",
    fields: [
      {
        name: "title",
        label: "What do you want built?",
        type: "text",
        required: true,
        placeholder: "Add dark mode toggle",
      },
      {
        name: "description",
        label: "Why is it needed?",
        type: "textarea",
        required: true,
        placeholder: "Users want to switch between light and dark themes.",
      },
      {
        name: "repo",
        label: "Target repository",
        type: "text",
        required: true,
        placeholder: "CleanExpo/ccw-crm",
      },
      {
        name: "intent_type",
        label: "Task type",
        type: "select",
        required: true,
        options: ["feature", "bugfix", "chore", "hotfix", "spike"],
      },
      {
        name: "acceptance_criteria",
        label: "Done when…",
        type: "textarea",
        required: true,
        placeholder: "Toggle persists after page reload.",
      },
      {
        name: "do_not_break",
        label: "Must not break",
        type: "text",
        required: true,
        placeholder: "Login flow, dashboard charts",
      },
      {
        name: "custom_eval_threshold",
        label: "Quality gate (0–10)",
        type: "number",
        required: false,
        placeholder: "8.5",
        hint: "Minimum score to auto-ship. Default from .harness/config.yaml.",
      },
      {
        name: "autonomy_budget",
        label: "Time budget (minutes)",
        type: "select",
        required: false,
        options: ["10", "30", "60", "120", "240"],
        hint: "Maps to model tier + retries. 60 = Sonnet + 3 retries.",
      },
      {
        name: "target_files",
        label: "Restrict to files/dirs",
        type: "array",
        required: false,
        placeholder: "app/dashboard/components/",
        hint: "One path per line. Prevents scope creep.",
      },
      {
        name: "research_intent",
        label: "Research direction",
        type: "textarea",
        required: false,
        placeholder: "Explore CSS variables vs Tailwind dark: prefix",
        hint: "Guides the research phase toward a specific approach.",
      },
      {
        name: "max_files_modified",
        label: "Max files to modify",
        type: "number",
        required: false,
        placeholder: "5",
        hint: "Violations trigger alert and skip eval loop.",
      },
      {
        name: "plan_discovery",
        label: "Enable plan variation discovery",
        type: "boolean",
        required: false,
        hint: "Generates 3 approaches and picks the best (+5 min).",
      },
    ],
  },
];

// ── Route handlers ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier");

  if (tier && !["basic", "detailed", "advanced"].includes(tier)) {
    return NextResponse.json(
      { error: "tier must be one of: basic, detailed, advanced" },
      { status: 400 },
    );
  }

  const templates = tier ? TEMPLATES.filter((t) => t.tier === tier) : TEMPLATES;

  return NextResponse.json({ data: templates });
}
