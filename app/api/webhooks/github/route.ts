import { NextRequest, NextResponse, after } from "next/server";
import * as crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { recordWebhookFailure } from "@/lib/webhook-audit";
import { apiError } from "@/lib/api-errors";
import {
  RELEASE_FANOUT_PAGE_SIZE,
  RELEASE_NOTES_FAILED,
  RELEASE_NOTES_PENDING,
  RELEASE_NOTICE_LINK,
  releaseVersionLabel,
} from "@/lib/releases/release-state";

function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);
  // RA-6940 — timingSafeEqual THROWS on length mismatch, turning any
  // wrong-length x-hub-signature-256 header into a 500 instead of a 401.
  // Length is not secret (the digest length is public), so a plain
  // pre-check is safe.
  if (digestBuf.length !== signatureBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(digestBuf, signatureBuf);
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
    // RA-1803: return 200 no-op instead of 500 — secret not configured means
    // webhook isn't actively wired; returning 500 pollutes the error feed on
    // every sandbox→main merge. GitHub will stop retrying on 200.
    console.warn(
      "[github-webhook] GITHUB_WEBHOOK_SECRET not set — request ignored",
    );
    return NextResponse.json(
      { ok: false, reason: "webhook not configured" },
      { status: 200 },
    );
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Missing signature",
      status: 401,
    });
  }

  const body = await req.text();

  if (!verifySignature(body, signature, secret)) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Invalid signature",
      status: 401,
    });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "push") {
    return NextResponse.json({ data: "ignored" });
  }

  // RA-1274: dedupe GitHub redeliveries on the x-github-delivery header.
  // Without this, GitHub's retry-on-5xx behaviour would re-call Anthropic
  // for the same commits (duplicate billing) and potentially create
  // duplicate notification rows if the version derivation drifted.
  const deliveryId = req.headers.get("x-github-delivery");
  if (deliveryId) {
    const existingDelivery = await (prisma as any).appRelease.findUnique({
      where: { githubDeliveryId: deliveryId },
      select: { id: true },
    });
    if (existingDelivery) {
      return NextResponse.json({ data: "duplicate delivery — skipped" });
    }
  }

  let payload: {
    ref?: string;
    after?: string;
    commits?: Array<{ message: string; author: { name: string } }>;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid JSON",
      status: 400,
    });
  }

  // Only process pushes to main
  if (payload.ref !== "refs/heads/main") {
    return NextResponse.json({ data: "ignored — not main" });
  }

  const commits = payload.commits || [];
  const commitSha = payload.after;
  if (!commitSha) {
    return NextResponse.json({ data: "ignored — no commit sha" });
  }

  // RA-8607: a release is keyed on the pushed commit, not on a version
  // derived from the constant package.json version. The old version key
  // could only take three values, so every push after the third was
  // silently skipped as "already processed".
  const existing = await prisma.appRelease.findFirst({
    where: { commitSha },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ data: "already processed" });
  }
  const version = releaseVersionLabel(commits, commitSha);

  // Create the release record immediately with placeholder notes so we can
  // return 200 before the AI call (prevents GitHub's 10-second timeout).
  // RA-1274: persist the delivery ID too so later redeliveries short-circuit.
  let release;
  try {
    release = await (prisma as any).appRelease.create({
      data: {
        version,
        title: `Version ${version}`,
        notes: RELEASE_NOTES_PENDING,
        commitSha,
        githubDeliveryId: deliveryId || null,
      },
    });
  } catch (err: any) {
    // P2002 on githubDeliveryId OR version — redelivery race, just ack.
    if (err?.code === "P2002") {
      return NextResponse.json({ data: "race dedup — skipped" });
    }
    throw err;
  }

  // Fire-and-forget: generate real notes + fan-out notifications in background.
  // Failures are logged but must never block the webhook response.
  after(async () => {
    try {
      const { title, notes } = await generateReleaseNotes(commits, version);

      await prisma.appRelease.update({
        where: { id: release.id },
        data: { title, notes },
      });

      // Fan-out: a notification for every active user, read in ordered
      // pages so no user is dropped (RA-8607: the old single read stopped
      // at 5000 with no order and no signal).
      let cursor: string | undefined;
      for (;;) {
        const users = await prisma.user.findMany({
          where: {
            OR: [
              { subscriptionStatus: { in: ["ACTIVE", "TRIAL"] } },
              { lifetimeAccess: true },
            ],
          },
          select: { id: true },
          orderBy: { id: "asc" },
          take: RELEASE_FANOUT_PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (users.length === 0) break;

        await prisma.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            title,
            message: `See what's new in ${version}`,
            type: "INFO" as NotificationType,
            link: RELEASE_NOTICE_LINK,
          })),
        });

        if (users.length < RELEASE_FANOUT_PAGE_SIZE) break;
        cursor = users[users.length - 1].id;
      }
    } catch (err) {
      console.error(
        "[github-webhook] Background release-notes job failed:",
        err,
      );
      // RA-8607: mark the row failed so it is never shown as ready and is
      // told apart from a job still running. The unseen route hides it.
      await prisma.appRelease
        .update({
          where: { id: release.id },
          data: { notes: RELEASE_NOTES_FAILED },
        })
        .catch((markErr: unknown) =>
          console.error(
            "[github-webhook] Could not mark release notes failed:",
            markErr,
          ),
        );
      await recordWebhookFailure({
        provider: "github",
        externalEventId: deliveryId,
        stage: "background-release-notes",
        error: err,
        details: { version, releaseId: release.id },
      });
    }
  });

  return NextResponse.json({
    data: { releaseId: release.id, version },
  });
}
