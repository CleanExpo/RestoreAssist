import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function deriveVersion(commits: Array<{ message: string }>): string {
  // Bump based on conventional commits: breaking → major, feat → minor, fix → patch
  // Default: bump patch from package.json version
  const messages = commits.map((c) => c.message.toLowerCase());
  const hasMajor = messages.some(
    (m) => m.includes("breaking") || m.includes("!:"),
  );
  const hasMinor = messages.some((m) => m.startsWith("feat"));

  // Read current version from package.json (baked at build time via env or fallback)
  const current = process.env.npm_package_version || "1.0.0";
  const [major, minor, patch] = current.split(".").map(Number);

  if (hasMajor) return `${major + 1}.0.0`;
  if (hasMinor) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function generateReleaseNotes(
  commits: Array<{ message: string; author: { name: string } }>,
  version: string,
): Promise<{ title: string; notes: string }> {
  if (commits.length === 0) {
    return {
      title: `Version ${version} — Maintenance Release`,
      notes: "Internal improvements and performance enhancements.",
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const commitList = commits
    .slice(0, 30)
    .map((c) => `- ${c.message}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are writing release notes for RestoreAssist, a compliance platform for Australian water damage restoration professionals.

Based on these git commits, write a short, friendly "What's New" announcement for version ${version}.

Commits:
${commitList}

Rules:
- Title: "Version ${version} — [catchy 3-5 word summary]"
- Notes: 3-6 bullet points in plain English (not technical jargon)
- Focus on what users can DO, not what code changed
- Keep it under 150 words total
- Format as JSON: {"title": "...", "notes": "- bullet 1\n- bullet 2\n..."}`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fallback if Claude returns unexpected format
  }

  return {
    title: `Version ${version}`,
    notes: commits
      .slice(0, 5)
      .map((c) => `- ${c.message}`)
      .join("\n"),
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await req.text();

  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "push") {
    return NextResponse.json({ data: "ignored" });
  }

  let payload: {
    ref?: string;
    after?: string;
    commits?: Array<{ message: string; author: { name: string } }>;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process pushes to main
  if (payload.ref !== "refs/heads/main") {
    return NextResponse.json({ data: "ignored — not main" });
  }

  const commits = payload.commits || [];
  const commitSha = payload.after;
  const version = deriveVersion(commits);

  // Skip if this version already exists (idempotent)
  const existing = await prisma.appRelease.findUnique({ where: { version } });
  if (existing) {
    return NextResponse.json({ data: "already processed" });
  }

  // Create the release record immediately with placeholder notes so we can
  // return 200 before the AI call (prevents GitHub's 10-second timeout).
  const release = await prisma.appRelease.create({
    data: {
      version,
      title: `Version ${version}`,
      notes: "Release notes generating…",
      commitSha,
    },
  });

  // Fire-and-forget: generate real notes + fan-out notifications in background.
  // Failures are logged but must never block the webhook response.
  void (async () => {
    try {
      const { title, notes } = await generateReleaseNotes(commits, version);

      await prisma.appRelease.update({
        where: { id: release.id },
        data: { title, notes },
      });

      // Fan-out: create a notification for every active user
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { subscriptionStatus: { in: ["ACTIVE", "TRIAL"] } },
            { lifetimeAccess: true },
          ],
        },
        select: { id: true },
        take: 5000,
      });

      if (users.length > 0) {
        await prisma.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            title,
            message: `See what's new in ${version}`,
            type: "INFO" as NotificationType,
            link: `/dashboard?release=${release.id}`,
          })),
          skipDuplicates: true,
        });
      }
    } catch (err) {
      console.error("[github-webhook] Background release-notes job failed:", err);
    }
  })();

  return NextResponse.json({
    data: { releaseId: release.id, version },
  });
}
