/**
 * Topic Bank — 50+ seed topic definitions for automated content generation
 *
 * Static array of topics spanning six categories. Each topic includes
 * product, angle, platform, duration, category, and weight.
 *
 * Use `seedTopics()` to insert all topics into the ContentTopic table.
 *
 * @module lib/content-pipeline/topic-bank
 */

import { prisma } from "@/lib/prisma";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface TopicSeed {
  product: string;
  angle: string;
  platform: string;
  duration: number;
  category: string;
  weight: number;
}

// ─── TOPIC DEFINITIONS ──────────────────────────────────────────────────────

export const TOPIC_BANK: TopicSeed[] = [
  // ── Feature Spotlight (weight 15) ───────────────────────────────────────
  {
    product: "RestoreAssist Scope Generator",
    angle: "How RestoreAssist generates a scope of works in 60 seconds",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "IICRC Compliance Engine",
    angle: "IICRC S500 compliance — automatic standard citations",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Integration Hub",
    angle: "One-click export to Xero, Ascora, and ServiceM8",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "AI Equipment Calculator",
    angle: "AI-powered equipment calculations",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Report Generator",
    angle: "Professional PDF reports that impress insurers",
    platform: "youtube",
    duration: 90,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Mobile Inspections",
    angle: "Mobile inspections from your phone",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Moisture Mapping",
    angle: "Real-time moisture mapping",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Job Management",
    angle: "Multi-property job management",
    platform: "youtube",
    duration: 90,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Classification Engine",
    angle: "Automatic water damage classification with IICRC citations",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },
  {
    product: "Building Code Checker",
    angle: "State-specific building code compliance alerts",
    platform: "youtube",
    duration: 60,
    category: "feature-spotlight",
    weight: 15,
  },

  // ── Industry Insight (weight 12) ────────────────────────────────────────
  {
    product: "RestoreAssist",
    angle: "The #1 mistake restorers make on insurance claims",
    platform: "youtube",
    duration: 90,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Why 40% of restoration scopes get rejected",
    platform: "youtube",
    duration: 90,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "How Australian building codes affect your scope",
    platform: "youtube",
    duration: 90,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Hidden cost of manual scope writing",
    platform: "youtube",
    duration: 60,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "IICRC certification guide for AU restorers",
    platform: "youtube",
    duration: 90,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Pre-site inspection checklist",
    platform: "youtube",
    duration: 60,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Top 5 claim documentation errors that cost you money",
    platform: "youtube",
    duration: 90,
    category: "industry-insight",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Insurance adjuster expectations in 2026",
    platform: "youtube",
    duration: 60,
    category: "industry-insight",
    weight: 12,
  },

  // ── Compliance Tip (weight 10) ──────────────────────────────────────────
  {
    product: "RestoreAssist Compliance",
    angle: "AS/NZS 3666 and legionella risk",
    platform: "youtube",
    duration: 60,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "Documenting water damage categories correctly",
    platform: "youtube",
    duration: 60,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "Mould remediation vs mould removal classification",
    platform: "youtube",
    duration: 90,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "Insurance documentation for Category 3 water loss",
    platform: "youtube",
    duration: 90,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "WHS requirements for restoration sites",
    platform: "youtube",
    duration: 60,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "IICRC S520 mould inspection protocol",
    platform: "youtube",
    duration: 90,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "Queensland QBCC requirements for restoration work",
    platform: "youtube",
    duration: 60,
    category: "compliance-tip",
    weight: 10,
  },
  {
    product: "RestoreAssist Compliance",
    angle: "NSW Fair Trading obligations for restorers",
    platform: "youtube",
    duration: 60,
    category: "compliance-tip",
    weight: 10,
  },

  // ── Problem/Solution (weight 15) ────────────────────────────────────────
  {
    product: "RestoreAssist",
    angle: "Tired of 3-hour scopes?",
    platform: "youtube",
    duration: 60,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Lost revenue from underbilling?",
    platform: "youtube",
    duration: 60,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "How one Brisbane restorer cut admin by 70%",
    platform: "youtube",
    duration: 90,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Stop losing claims — the data insurers want",
    platform: "youtube",
    duration: 60,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Manual scoping killing your margins?",
    platform: "youtube",
    duration: 60,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Your scope report is the first thing insurers judge",
    platform: "youtube",
    duration: 90,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Spending weekends on paperwork instead of jobs?",
    platform: "youtube",
    duration: 60,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Missing line items is costing you thousands",
    platform: "youtube",
    duration: 60,
    category: "problem-solution",
    weight: 15,
  },
  {
    product: "RestoreAssist",
    angle: "Insurer rejecting your scopes? Here is why.",
    platform: "youtube",
    duration: 90,
    category: "problem-solution",
    weight: 15,
  },

  // ── How-To (weight 8) ──────────────────────────────────────────────────
  {
    product: "RestoreAssist",
    angle: "Set up your first inspection",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Generate equipment lists automatically",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Export scope to Xero in 3 clicks",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Use AI to classify water damage",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Create compliant reports in minutes",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Add moisture readings to your inspection",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Customise your scope templates",
    platform: "youtube",
    duration: 90,
    category: "how-to",
    weight: 8,
  },
  {
    product: "RestoreAssist",
    angle: "Invite your team and manage permissions",
    platform: "youtube",
    duration: 60,
    category: "how-to",
    weight: 8,
  },

  // ── Social Proof (weight 12) ────────────────────────────────────────────
  {
    product: "RestoreAssist",
    angle: "From 3 hours to 15 minutes — a Melbourne story",
    platform: "youtube",
    duration: 90,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Why 200+ contractors chose RestoreAssist",
    platform: "youtube",
    duration: 60,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "97% scope acceptance rate",
    platform: "youtube",
    duration: 60,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Before & after: manual vs AI scopes",
    platform: "youtube",
    duration: 90,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "What insurance adjusters say about RA reports",
    platform: "youtube",
    duration: 90,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "How a Perth team doubled their job throughput",
    platform: "youtube",
    duration: 90,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "Real restorer review — unscripted",
    platform: "youtube",
    duration: 60,
    category: "social-proof",
    weight: 12,
  },
  {
    product: "RestoreAssist",
    angle: "The tool that changed how we quote jobs",
    platform: "youtube",
    duration: 60,
    category: "social-proof",
    weight: 12,
  },
];

// ─── SEED FUNCTION ──────────────────────────────────────────────────────────

/**
 * Insert all topics from TOPIC_BANK into the ContentTopic table.
 * Skips topics that already exist (matched by product + angle + platform).
 * Returns the count of newly inserted topics.
 */
export async function seedTopics(): Promise<number> {
  let inserted = 0;

  for (const topic of TOPIC_BANK) {
    // Check if this exact topic already exists
    const existing = await prisma.contentTopic.findFirst({
      where: {
        product: topic.product,
        angle: topic.angle,
        platform: topic.platform,
      },
    });

    if (!existing) {
      await prisma.contentTopic.create({
        data: {
          product: topic.product,
          angle: topic.angle,
          platform: topic.platform,
          duration: topic.duration,
          category: topic.category,
          weight: topic.weight,
          enabled: true,
        },
      });
      inserted++;
    }
  }

  return inserted;
}
