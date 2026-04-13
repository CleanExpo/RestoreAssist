/**
 * design-system-onboarding.ts — New project design brief trigger (RA-693)
 *
 * Queries Linear for projects created in the last 7 days that have not yet
 * had a design system brief raised. Sends a Telegram prompt to Phill to run
 * the design-system-to-production-quick-start skill for each unprocessed project.
 *
 * Required env vars:
 *   LINEAR_API_KEY          — read access to the workspace
 *   TELEGRAM_BOT_TOKEN      — notification channel
 *   TELEGRAM_CHAT_ID        — Phill's chat
 *
 * Schedule: daily at 09:00 AEST
 */

import type { CronJobResult } from "./runner";

// ── Linear API ────────────────────────────────────────────────────────────────

interface LinearProject {
  id: string;
  name: string;
  createdAt: string;
  url: string;
  description?: string;
}

async function fetchRecentLinearProjects(): Promise<LinearProject[]> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY not set");

  // Projects created in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    query RecentProjects($since: DateTimeOrDuration!) {
      projects(
        filter: { createdAt: { gte: $since } }
        first: 20
        orderBy: createdAt
      ) {
        nodes {
          id
          name
          createdAt
          url
          description
        }
      }
    }
  `;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables: { since } }),
  });

  if (!res.ok) {
    throw new Error(`Linear API error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    data?: { projects?: { nodes: LinearProject[] } };
  };
  return data.data?.projects?.nodes ?? [];
}

// ── Processed project tracking ────────────────────────────────────────────────
// We use a simple set of project IDs stored in the Linear project description
// as a lightweight marker. The cron checks for the sentinel tag "[design-brief-sent]"
// in the project description before sending a new prompt.

function hasDesignBriefSent(project: LinearProject): boolean {
  return (project.description ?? "").includes("[design-brief-sent]");
}

// ── Telegram notification ─────────────────────────────────────────────────────

async function notifyDesignBriefNeeded(
  project: LinearProject,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const text =
    `🎨 *New Project Needs a Design Brief*\n\n` +
    `*${project.name}* was created on ${new Date(project.createdAt).toLocaleDateString("en-AU")}.\n\n` +
    `Run the design-system-to-production-quick-start skill to build the website:\n` +
    `\`/design-system ${project.name}\`\n\n` +
    `Project: ${project.url}`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function markDesignBriefSent(
  projectId: string,
  currentDescription: string,
): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return;

  const mutation = `
    mutation UpdateProject($id: String!, $description: String!) {
      projectUpdate(id: $id, input: { description: $description }) {
        success
      }
    }
  `;

  const newDescription = `${currentDescription}\n\n[design-brief-sent]`.trim();

  await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { id: projectId, description: newDescription },
    }),
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function checkDesignSystemOnboarding(): Promise<CronJobResult> {
  const projects = await fetchRecentLinearProjects();

  const pending = projects.filter((p) => !hasDesignBriefSent(p));

  let notified = 0;
  const results: { project: string; notified: boolean }[] = [];

  for (const project of pending) {
    const sent = await notifyDesignBriefNeeded(project);
    if (sent) {
      // Fire-and-forget — failure to mark does not block the cron result
      markDesignBriefSent(project.id, project.description ?? "").catch(
        () => {},
      );
      notified++;
    }
    results.push({ project: project.name, notified: sent });
  }

  return {
    itemsProcessed: notified,
    metadata: {
      projectsChecked: projects.length,
      projectsPending: pending.length,
      results,
    },
  };
}
