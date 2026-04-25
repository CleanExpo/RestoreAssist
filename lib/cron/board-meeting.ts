/**
 * Automated CEO Board Meeting (RA-686)
 *
 * Runs the 9-persona CEO Board deliberation automatically.
 * Orchestrated as a weekly cron (Tuesdays 00:00 UTC — after Scout fires Monday).
 *
 * Pipeline:
 *   Phase 1 — Gather intelligence (Linear backlog, scout findings, project health)
 *   Phase 2 — Run structured 9-persona deliberation via Claude Opus
 *   Phase 3 — Push decision memo + action items to Linear
 *   Phase 4 — Send Telegram summary (if TELEGRAM_BOT_TOKEN configured)
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY      — Claude Opus for board deliberation
 *   LINEAR_API_KEY         — Read scout findings + create action items
 *
 * Optional:
 *   TELEGRAM_BOT_TOKEN     — Telegram bot token
 *   TELEGRAM_CHAT_ID       — CEO personal chat ID or channel
 *   LINEAR_RA_TEAM_ID      — RA team UUID (default hardcoded)
 *   LINEAR_SCOUT_LABEL_ID  — scout label UUID (default hardcoded)
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RA_TEAM_ID =
  process.env.LINEAR_RA_TEAM_ID ?? "a8a52f07-63cf-4ece-9ad2-3e3bd3c15673";
const SCOUT_LABEL_ID =
  process.env.LINEAR_SCOUT_LABEL_ID ?? "2e3fcf07-9a7a-4477-9e4b-fcbb9f5b7f5c";
const RA_TODO_STATE_ID =
  process.env.LINEAR_RA_TODO_STATE_ID ?? "285c7d2f-d5f4-4ae1-8e3a-bc96c9aaf130";

// ---------------------------------------------------------------------------
// Linear query helpers
// ---------------------------------------------------------------------------

async function linearQuery<T>(query: string, variables?: object): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY not configured");

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Linear API error: ${res.status}`);
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (json.errors)
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// Phase 1: Gather Intelligence
// ---------------------------------------------------------------------------

interface IntelligenceBrief {
  date: string;
  urgentIssues: Array<{ id: string; title: string; priority: number }>;
  scoutFindings: Array<{ id: string; title: string }>;
  backlogSize: number;
  inProgressCount: number;
}

async function gatherIntelligence(): Promise<IntelligenceBrief> {
  const date = new Date().toISOString().split("T")[0];

  // Fetch high-priority open issues (P1-P2)
  const issuesData = await linearQuery<{
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        priority: number;
      }>;
    };
  }>(`{
    issues(filter: {
      team: { id: { eq: "${RA_TEAM_ID}" } }
      state: { name: { in: ["Todo", "Backlog", "In Progress"] } }
      priority: { lte: 2 }
    }, first: 20) {
      nodes { id identifier title priority }
    }
  }`);

  // Fetch recent scout findings (created in last 7 days)
  const oneWeekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const scoutData = await linearQuery<{
    issues: { nodes: Array<{ id: string; identifier: string; title: string }> };
  }>(`{
    issues(filter: {
      team: { id: { eq: "${RA_TEAM_ID}" } }
      labels: { id: { eq: "${SCOUT_LABEL_ID}" } }
      createdAt: { gte: "${oneWeekAgo}" }
    }, first: 10) {
      nodes { id identifier title }
    }
  }`);

  // Count backlog and in-progress
  const countData = await linearQuery<{
    backlog: { nodes: Array<{ id: string }> };
    inProgress: { nodes: Array<{ id: string }> };
  }>(`{
    backlog: issues(filter: {
      team: { id: { eq: "${RA_TEAM_ID}" } }
      state: { name: { in: ["Todo", "Backlog"] } }
    }, first: 100) { nodes { id } }
    inProgress: issues(filter: {
      team: { id: { eq: "${RA_TEAM_ID}" } }
      state: { name: { eq: "In Progress" } }
    }, first: 50) { nodes { id } }
  }`);

  return {
    date,
    urgentIssues: issuesData.issues.nodes.map((i) => ({
      id: i.identifier,
      title: i.title,
      priority: i.priority,
    })),
    scoutFindings: scoutData.issues.nodes.map((i) => ({
      id: i.identifier,
      title: i.title,
    })),
    backlogSize: countData.backlog.nodes.length,
    inProgressCount: countData.inProgress.nodes.length,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Run Board Deliberation
// ---------------------------------------------------------------------------

function buildBoardBrief(intel: IntelligenceBrief): string {
  const urgentList =
    intel.urgentIssues.length > 0
      ? intel.urgentIssues
          .map((i) => `  • [P${i.priority}] ${i.id}: ${i.title}`)
          .join("\n")
      : "  (none)";

  const scoutList =
    intel.scoutFindings.length > 0
      ? intel.scoutFindings.map((i) => `  • ${i.id}: ${i.title}`).join("\n")
      : "  (no scout findings this week)";

  return `## Weekly Intelligence Brief — ${intel.date}

**Sprint Health:**
- Backlog size: ${intel.backlogSize} issues
- In Progress: ${intel.inProgressCount} issues

**Urgent Issues (P1-P2):**
${urgentList}

**Scout Findings (last 7 days):**
${scoutList}

**Context:**
RestoreAssist is an Australian water damage restoration compliance SaaS.
We are in active pilot phase targeting 20 enterprise restoration companies.
Stack: Next.js 15, Prisma, Supabase, Capacitor (iOS + Android), deployed on Vercel.

**Decision needed:**
Given this week's intelligence, what should be the board's top strategic priority for the coming sprint? Consider: which urgent issues represent technical debt vs. strategic capability, whether any scout findings should be acted on immediately, and whether the current velocity is appropriate for the pilot timeline.`;
}

async function runBoardDeliberation(brief: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are running an automated CEO Board deliberation for RestoreAssist.

Nine specialist personas debate strategic decisions in sequence:
1. CEO — frames the real question, synthesises at the end (Opus-level reasoning)
2. Revenue — commercial viability, unit economics, growth mechanics
3. Product Strategist — user value, roadmap coherence, job-to-be-done
4. Technical Architect — feasibility, architecture trade-offs, technical debt
5. Market Strategist — competitive landscape, positioning, market timing
6. Compounder — long-horizon thinking, network effects, what compounds over time
7. Moonshot — 10x thinking, asymmetric bets, challenge incremental assumptions
8. Custom Oracle — Australian restoration SaaS domain expert, insurance & compliance context
9. Contrarian — stress-tests every assumption, adversarial by design

Each persona speaks in their own voice. Disagreements are explicit and by name. The Contrarian is direct and sometimes confrontational. No polite convergence.

Run the complete 6-stage deliberation:
Stage 1: CEO frames the real question and debate parameters
Stage 2: Board debates (Round 1 positions → Round 2 Contrarian cross-exam → Round 3 revised positions)
Stage 3: Constraint Check (Technical Architect + Revenue)
Stage 4: Final one-sentence statements from each persona
Stage 5: CEO Decision Memo

Format the memo clearly with these sections:
DECISION / RATIONALE / THE DISSENT THAT ALMOST CHANGED MY MIND / WHAT WOULD CHANGE THIS DECISION / NEXT ACTIONS / RISK TO WATCH

Keep each persona's contributions concise (3-5 sentences each). The goal is a decision, not an essay.`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Here is this week's intelligence brief:\n\n${brief}\n\nConvene the board. Run the full deliberation and produce the CEO memo.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ---------------------------------------------------------------------------
// Phase 3: Extract action items and create Linear issues
// ---------------------------------------------------------------------------

function extractActionItems(
  memo: string,
): Array<{ title: string; description: string }> {
  // Extract the NEXT ACTIONS section from the memo
  const actionsMatch = memo.match(
    /NEXT ACTIONS\s*\n([\s\S]*?)(?:\n(?:RISK TO WATCH|═+)|$)/i,
  );
  if (!actionsMatch) return [];

  const actionsText = actionsMatch[1].trim();
  const items: Array<{ title: string; description: string }> = [];

  // Parse numbered or bulleted action items
  const lines = actionsText.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const clean = line.replace(/^[\d.\-*\s]+/, "").trim();
    if (clean.length > 10) {
      items.push({
        title: `[Board] ${clean.slice(0, 80)}`,
        description: `Action item from automated CEO Board meeting (${new Date().toISOString().split("T")[0]})\n\n${clean}`,
      });
    }
  }

  return items.slice(0, 3); // Cap at 3 action items
}

async function createLinearActionItems(
  items: Array<{ title: string; description: string }>,
  meetingDate: string,
): Promise<number> {
  if (!process.env.LINEAR_API_KEY) return 0;

  let created = 0;
  for (const item of items) {
    try {
      await linearQuery(`
        mutation {
          issueCreate(input: {
            teamId: "${RA_TEAM_ID}"
            title: ${JSON.stringify(item.title)}
            description: ${JSON.stringify(item.description)}
            stateId: "${RA_TODO_STATE_ID}"
            priority: 2
          }) { success }
        }
      `);
      created++;
    } catch {
      console.error(
        "[board-meeting] Failed to create action item:",
        item.title,
      );
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Phase 4: Telegram summary (optional)
// ---------------------------------------------------------------------------

async function sendTelegramSummary(
  memo: string,
  intel: IntelligenceBrief,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  // Extract just the DECISION section for the Telegram message
  const decisionMatch = memo.match(/DECISION\s*\n([\s\S]*?)(?:\nRATIONALE|$)/i);
  const decision = decisionMatch
    ? decisionMatch[1].trim().slice(0, 500)
    : "See Linear for full memo.";

  const message = [
    `📋 *RestoreAssist Board Meeting — ${intel.date}*`,
    "",
    `*Decision:*`,
    decision,
    "",
    `Sprint: ${intel.backlogSize} backlog · ${intel.inProgressCount} in progress`,
    `Scout findings: ${intel.scoutFindings.length} this week`,
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });
}

async function storeMemoAsLinearDoc(
  memo: string,
  intel: IntelligenceBrief,
): Promise<void> {
  if (!process.env.LINEAR_API_KEY) return;

  const title = `Board Meeting Memo — ${intel.date}`;
  // Truncate memo to 5000 chars to stay within Linear limits
  const truncated = memo.length > 5000 ? memo.slice(0, 4980) + "…" : memo;

  // Create a high-priority issue as the meeting record
  await linearQuery(`
    mutation {
      issueCreate(input: {
        teamId: "${RA_TEAM_ID}"
        title: ${JSON.stringify(title)}
        description: ${JSON.stringify(truncated)}
        stateId: "${RA_TODO_STATE_ID}"
        priority: 2
      }) { success }
    }
  `).catch(() => {
    // Non-fatal — memo storage failure doesn't block action items
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface BoardMeetingResult {
  date: string;
  intelligenceGathered: boolean;
  deliberationRan: boolean;
  actionItemsCreated: number;
  telegramSent: boolean;
  memoLength: number;
}

export async function runBoardMeeting(): Promise<BoardMeetingResult> {
  const result: BoardMeetingResult = {
    date: new Date().toISOString().split("T")[0],
    intelligenceGathered: false,
    deliberationRan: false,
    actionItemsCreated: 0,
    telegramSent: false,
    memoLength: 0,
  };

  // Phase 1: Gather intelligence
  let intel: IntelligenceBrief;
  try {
    intel = await gatherIntelligence();
    result.intelligenceGathered = true;
  } catch (err) {
    console.error("[board-meeting] Intelligence gathering failed:", err);
    throw err;
  }

  // Phase 2: Run deliberation
  const brief = buildBoardBrief(intel);
  let memo: string;
  try {
    memo = await runBoardDeliberation(brief);
    result.deliberationRan = true;
    result.memoLength = memo.length;
  } catch (err) {
    console.error("[board-meeting] Deliberation failed:", err);
    throw err;
  }

  // Phase 3: Store memo + create action items (best-effort)
  try {
    await storeMemoAsLinearDoc(memo, intel);
    const actionItems = extractActionItems(memo);
    result.actionItemsCreated = await createLinearActionItems(
      actionItems,
      intel.date,
    );
  } catch (err) {
    console.error("[board-meeting] Linear phase failed:", err);
    // Continue to Telegram
  }

  // Phase 4: Telegram summary (best-effort)
  try {
    await sendTelegramSummary(memo, intel);
    result.telegramSent =
      !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  } catch (err) {
    console.error("[board-meeting] Telegram send failed:", err);
  }

  return result;
}
