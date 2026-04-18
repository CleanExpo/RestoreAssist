/**
 * Scout Agent — Autonomous External Intelligence Gathering (RA-684)
 *
 * Runs weekly (Monday pre-board) to pull external intelligence from:
 *   1. GitHub (trending AI/LLM/agentic repositories)
 *   2. ArXiv (recent papers in cs.AI, agentic systems, RAG, eval)
 *   3. Hacker News (top AI/engineering discussions)
 *
 * Each finding is scored against 15 ZTE dimensions by Claude Haiku.
 * Findings with relevance >= 3 are filed as Linear issues with the
 * `scout` label, ready for Phase 1 of the automated board meeting.
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY        — Claude for relevance scoring
 *   LINEAR_API_KEY           — Linear for issue creation
 *   LINEAR_RA_TEAM_ID        — RA team UUID (default hardcoded)
 *   LINEAR_SCOUT_LABEL_ID    — scout label UUID (default hardcoded)
 *   LINEAR_RA_TODO_STATE_ID  — Todo state UUID (default hardcoded)
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// ZTE Dimensions — Pi-CEO's 15-dimension health framework for RestoreAssist
// ---------------------------------------------------------------------------

const ZTE_DIMENSIONS = [
  {
    id: 1,
    name: "Agentic Architecture",
    desc: "Multi-agent systems, orchestration patterns, autonomous workflows",
  },
  {
    id: 2,
    name: "LLM Evaluation",
    desc: "Model evaluation, benchmarking, confidence scoring",
  },
  {
    id: 3,
    name: "RAG & Knowledge Systems",
    desc: "Retrieval-augmented generation, vector search, knowledge graphs",
  },
  {
    id: 4,
    name: "Developer Autonomy",
    desc: "Code generation, automated PR review, CI/CD intelligence",
  },
  {
    id: 5,
    name: "AI Cost Optimisation",
    desc: "Token efficiency, model routing, inference cost reduction",
  },
  {
    id: 6,
    name: "Security & Compliance",
    desc: "AI safety, data privacy, secrets management, compliance automation",
  },
  {
    id: 7,
    name: "Product Intelligence",
    desc: "User behaviour analytics, product-market fit signals",
  },
  {
    id: 8,
    name: "Integration Ecosystem",
    desc: "API integrations, webhook patterns, data sync primitives",
  },
  {
    id: 9,
    name: "Mobile & Cross-Platform",
    desc: "Mobile AI, Capacitor/React Native advances, PWA capabilities",
  },
  {
    id: 10,
    name: "Infrastructure Scalability",
    desc: "Serverless, edge computing, distributed systems patterns",
  },
  {
    id: 11,
    name: "Content & SEO Automation",
    desc: "AI-driven content generation, programmatic SEO, distribution",
  },
  {
    id: 12,
    name: "Open Source Leverage",
    desc: "New OSS tools directly applicable to RestoreAssist stack",
  },
  {
    id: 13,
    name: "Competitive Landscape",
    desc: "Competitor moves, market shifts, restoration industry news",
  },
  {
    id: 14,
    name: "Revenue & Growth",
    desc: "Monetisation patterns, SaaS growth strategies, pricing models",
  },
  {
    id: 15,
    name: "Australian Compliance",
    desc: "AU regulatory changes, insurance standards, IICRC updates",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoutFinding {
  source: "github" | "arxiv" | "hackernews";
  title: string;
  url: string;
  summary: string;
  relevanceScore: number; // 1–5 overall
  topDimension: string;
  topDimensionScore: number;
  recommendedAction: string;
}

// ---------------------------------------------------------------------------
// Source fetchers
// ---------------------------------------------------------------------------

async function fetchGitHubFindings(): Promise<ScoutFinding[]> {
  const queries = [
    "topic:llm-agents stars:>50",
    "agentic AI orchestration framework language:typescript stars:>30",
    "topic:mcp-server stars:>50",
  ];

  const seen = new Set<string>();
  const findings: ScoutFinding[] = [];

  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=3`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RestoreAssist-Scout/1.0",
        },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        items?: Array<{
          html_url: string;
          full_name: string;
          description: string | null;
          stargazers_count: number;
        }>;
      };
      for (const repo of data.items?.slice(0, 2) ?? []) {
        if (seen.has(repo.html_url)) continue;
        seen.add(repo.html_url);
        findings.push({
          source: "github",
          title: repo.full_name,
          url: repo.html_url,
          summary:
            (repo.description ?? "No description") +
            ` — ⭐${repo.stargazers_count}`,
          relevanceScore: 0,
          topDimension: "",
          topDimensionScore: 0,
          recommendedAction: "",
        });
      }
    } catch {
      // Best-effort; continue to next query
    }
  }

  return findings.slice(0, 6);
}

async function fetchArxivFindings(): Promise<ScoutFinding[]> {
  const searchQuery =
    'cat:cs.AI AND (agentic OR "multi-agent" OR "tool use" OR RAG OR "retrieval augmented")';
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&sortBy=submittedDate&sortOrder=descending&max_results=6`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RestoreAssist-Scout/1.0" },
    });
    if (!res.ok) return [];

    const text = await res.text();
    const entries = text.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    const findings: ScoutFinding[] = [];

    for (const entry of entries.slice(0, 5)) {
      const title = entry
        .match(/<title>([\s\S]*?)<\/title>/)?.[1]
        ?.replace(/\n\s+/g, " ")
        .trim();
      const id = entry.match(/<id>(.*?)<\/id>/)?.[1]?.trim();
      const rawSummary = entry
        .match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
        ?.replace(/\n\s+/g, " ")
        .trim();
      const summary = rawSummary ? rawSummary.slice(0, 400) + "…" : "";

      if (!title || !id) continue;

      findings.push({
        source: "arxiv",
        title,
        url: id,
        summary,
        relevanceScore: 0,
        topDimension: "",
        topDimensionScore: 0,
        recommendedAction: "",
      });
    }

    return findings;
  } catch {
    return [];
  }
}

async function fetchHNFindings(): Promise<ScoutFinding[]> {
  const queries = [
    "agentic AI LLM",
    "Claude MCP tools",
    "autonomous coding agent",
  ];
  const seen = new Set<string>();
  const findings: ScoutFinding[] = [];

  for (const q of queries) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=3&numericFilters=points>30`;
      const res = await fetch(url, {
        headers: { "User-Agent": "RestoreAssist-Scout/1.0" },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        hits?: Array<{
          title: string;
          url?: string;
          objectID: string;
          points: number;
          num_comments: number;
        }>;
      };
      for (const hit of data.hits?.slice(0, 2) ?? []) {
        const storyUrl =
          hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
        if (seen.has(storyUrl)) continue;
        seen.add(storyUrl);

        findings.push({
          source: "hackernews",
          title: hit.title,
          url: storyUrl,
          summary: `${hit.points} points · ${hit.num_comments} comments`,
          relevanceScore: 0,
          topDimension: "",
          topDimensionScore: 0,
          recommendedAction: "",
        });
      }
    } catch {
      // Best-effort
    }
  }

  return findings.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Claude scoring
// ---------------------------------------------------------------------------

async function scoreFindings(
  findings: ScoutFinding[],
): Promise<ScoutFinding[]> {
  if (!process.env.ANTHROPIC_API_KEY) return findings;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const dimensionList = ZTE_DIMENSIONS.map(
    (d) => `${d.id}. ${d.name}: ${d.desc}`,
  ).join("\n");

  const findingsList = findings
    .map(
      (f, i) =>
        `[${i}] Source: ${f.source.toUpperCase()}\nTitle: ${f.title}\nURL: ${f.url}\nSummary: ${f.summary}`,
    )
    .join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are the RestoreAssist Scout Agent. Score external tech findings for relevance to RestoreAssist — an Australian water damage restoration compliance SaaS (Next.js 15, Prisma, Supabase, Capacitor, IICRC standards).

ZTE DIMENSIONS:
${dimensionList}

FINDINGS TO SCORE:
${findingsList}

For each finding, return a JSON array:
[{
  "index": 0,
  "overallRelevance": 1,
  "topDimension": "Agentic Architecture",
  "topDimensionScore": 3,
  "recommendedAction": "Evaluate for use in compliance report generation pipeline"
}]

Scoring guide:
5 = Directly applicable, should be adopted/investigated immediately
4 = Clearly relevant, worth a spike investigation
3 = Tangentially relevant, worth monitoring
2 = Low relevance, skip unless priorities shift
1 = Not relevant to RestoreAssist

Be conservative — only score ≥ 3 if genuinely applicable to this Australian restoration SaaS.
Return ONLY the JSON array, no other text.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "[]";
    const cleanJson = text.replace(/```(?:json)?\n?|\n?```/g, "").trim();
    const scores = JSON.parse(cleanJson) as Array<{
      index: number;
      overallRelevance: number;
      topDimension: string;
      topDimensionScore: number;
      recommendedAction: string;
    }>;

    for (const score of scores) {
      const finding = findings[score.index];
      if (!finding) continue;
      finding.relevanceScore = Math.min(5, Math.max(1, score.overallRelevance));
      finding.topDimension = score.topDimension;
      finding.topDimensionScore = Math.min(
        5,
        Math.max(1, score.topDimensionScore),
      );
      finding.recommendedAction = score.recommendedAction;
    }
  } catch {
    // If scoring fails, mark everything as 2 so they're visible but not noisy
    findings.forEach((f) => {
      if (f.relevanceScore === 0) {
        f.relevanceScore = 2;
        f.recommendedAction = "Review manually — auto-scoring unavailable";
      }
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Linear issue creation
// ---------------------------------------------------------------------------

async function createLinearIssue(finding: ScoutFinding): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return;

  const teamId =
    process.env.LINEAR_RA_TEAM_ID ?? "a8a52f07-63cf-4ece-9ad2-3e3bd3c15673";
  const labelId =
    process.env.LINEAR_SCOUT_LABEL_ID ?? "2e3fcf07-9a7a-4477-9e4b-fcbb9f5b7f5c";
  const stateId =
    process.env.LINEAR_RA_TODO_STATE_ID ??
    "285c7d2f-d5f4-4ae1-8e3a-bc96c9aaf130";

  const sourceTag = finding.source.toUpperCase();
  const runDate = new Date().toISOString().split("T")[0];

  const description = [
    `## Scout Finding — ${sourceTag}`,
    "",
    `**Source:** [${finding.title}](${finding.url})`,
    `**Relevance Score:** ${finding.relevanceScore}/5`,
    finding.topDimension
      ? `**Top ZTE Dimension:** ${finding.topDimension} (${finding.topDimensionScore}/5)`
      : "",
    "",
    "### Summary",
    finding.summary,
    "",
    "### Recommended Action",
    finding.recommendedAction || "Review and assess applicability.",
    "",
    "---",
    `*Auto-generated by RestoreAssist Scout Agent — ${runDate}*`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { identifier } }
      }`,
      variables: {
        input: {
          teamId,
          title: `[Scout/${sourceTag}] ${finding.title.slice(0, 90)}`,
          description,
          labelIds: [labelId],
          stateId,
          priority: 3, // Medium — requires board review
        },
      },
    }),
  });

  if (!res.ok) {
    console.error(`[scout-agent] Linear issue creation failed: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ScoutAgentResult {
  findingsCollected: number;
  findingsScored: number;
  issuesCreated: number;
  sources: {
    github: number;
    arxiv: number;
    hackernews: number;
  };
}

export async function runScoutAgent(): Promise<ScoutAgentResult> {
  // Fetch from all 3 sources in parallel
  const [githubFindings, arxivFindings, hnFindings] = await Promise.all([
    fetchGitHubFindings(),
    fetchArxivFindings(),
    fetchHNFindings(),
  ]);

  const allFindings = [...githubFindings, ...arxivFindings, ...hnFindings];

  if (allFindings.length === 0) {
    return {
      findingsCollected: 0,
      findingsScored: 0,
      issuesCreated: 0,
      sources: { github: 0, arxiv: 0, hackernews: 0 },
    };
  }

  // Score with Claude Haiku
  const scored = await scoreFindings(allFindings);
  const findingsScored = scored.filter((f) => f.relevanceScore > 0).length;

  // Create Linear issues for findings with relevance >= 3
  const relevant = scored.filter((f) => f.relevanceScore >= 3);
  let issuesCreated = 0;

  for (const finding of relevant) {
    try {
      await createLinearIssue(finding);
      issuesCreated++;
    } catch (err) {
      console.error("[scout-agent] Failed to create Linear issue:", err);
    }
  }

  return {
    findingsCollected: allFindings.length,
    findingsScored,
    issuesCreated,
    sources: {
      github: githubFindings.length,
      arxiv: arxivFindings.length,
      hackernews: hnFindings.length,
    },
  };
}
