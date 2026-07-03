/**
 * Work-type classifier for the continuous Linear-driven agent loop.
 *
 * Two-stage classification per spec §4: Linear labels are checked first
 * (cheap, reliable) and only fall back to free-text keyword matching over
 * title + description when no label maps to a bucket.
 */

import type { ClassificationResult, LinearIssueInput, WorkTypeBucket } from "./types";

// Label → bucket. Checked in this order; first match wins. Labels are
// lower-cased before comparison so Linear label casing never matters.
const LABEL_BUCKET_MAP: Array<{ labels: string[]; bucket: WorkTypeBucket }> = [
  { labels: ["security", "vuln", "vulnerability"], bucket: "security" },
  { labels: ["infra", "infrastructure", "deployment", "devops"], bucket: "infra" },
  { labels: ["video"], bucket: "video" },
  { labels: ["marketing", "campaign", "seo", "geo"], bucket: "marketing" },
  { labels: ["copy", "copywriting"], bucket: "copy" },
  { labels: ["design", "ui", "ux"], bucket: "design" },
  { labels: ["bug", "defect"], bucket: "bug" },
  { labels: ["feature", "enhancement"], bucket: "feature" },
];

// Free-text fallback keyword → bucket, checked in this priority order
// (security first: a security keyword should never be shadowed by an
// incidental "bug" mention in the same description).
const TEXT_BUCKET_MAP: Array<{ keywords: string[]; bucket: WorkTypeBucket }> = [
  {
    keywords: ["xss", "csrf", "vulnerability", "exploit", "auth bypass", "service-role key", "secret leak"],
    bucket: "security",
  },
  { keywords: ["deploy", "vercel", "railway", "ci pipeline", "build failing", "out-of-memory"], bucket: "infra" },
  { keywords: ["render", "narrate", "caption", "video series", "explainer video"], bucket: "video" },
  { keywords: ["landing page", "campaign", "funnel", "seo", "ad copy"], bucket: "marketing" },
  { keywords: ["subject line", "microcopy", "tone", "wording"], bucket: "copy" },
  { keywords: ["border radius", "design token", "visual hierarchy", "layout", "spacing"], bucket: "design" },
  { keywords: ["crash", "throws", "divide-by-zero", "regression", "broken"], bucket: "bug" },
];

function normalise(text: string): string {
  return text.toLowerCase();
}

export function classifyWorkItem(issue: LinearIssueInput): ClassificationResult {
  const normalisedLabels = issue.labels.map((label) => normalise(label));

  for (const entry of LABEL_BUCKET_MAP) {
    const matched = entry.labels.find((label) => normalisedLabels.includes(label));
    if (matched) {
      return { bucket: entry.bucket, matchedSignals: [matched], confidence: "label" };
    }
  }

  const haystack = normalise(`${issue.title} ${issue.description}`);
  for (const entry of TEXT_BUCKET_MAP) {
    const matched = entry.keywords.filter((keyword) => haystack.includes(keyword));
    if (matched.length > 0) {
      return { bucket: entry.bucket, matchedSignals: matched, confidence: "text" };
    }
  }

  // No label or keyword matched anything: default to "feature" — the
  // broadest, lowest-risk bucket (routes to spm + feature-shaped skills,
  // never silently drops into a narrower, wrong specialist).
  return { bucket: "feature", matchedSignals: [], confidence: "text" };
}
