/**
 * Admin Margot workspace — ops chat + social-comment relevance tools.
 * Layout matches elevated dashboard surfaces (WHS / Analytics / Help).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  PlusIcon,
  ExternalLinkIcon,
  Bot,
  ShieldCheck,
  PanelRightOpen,
  PanelRightClose,
  Radio,
  Sparkles,
} from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Attachments } from "@/components/ai-elements/attachments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SocialRelevanceTester } from "@/components/margot/SocialRelevanceTester";
import {
  DashboardPanel,
  dashboardSurfaceClass,
} from "@/app/dashboard/components/DashboardPanel";
import { cn } from "@/lib/utils";
import {
  MARGOT_AVATAR_ORB_PATH,
  MARGOT_DISPLAY_NAME,
} from "@/lib/margot-surface";

const STARTER_PROMPTS = [
  {
    label: "Briefing",
    text: "Give me a short ops briefing for RestoreAssist this week.",
  },
  {
    label: "Social: refuse car",
    text: "Draft a LinkedIn comment on this post: Finished a classic car restoration on this Mustang",
  },
  {
    label: "Social: refuse teeth",
    text: "Write a Facebook reply to: Best teeth restoration clinic for veneers in Brisbane",
  },
  {
    label: "Social: engage water",
    text: "Draft a short comment on: Water damage restoration after a burst pipe — moisture mapping tips?",
  },
];

export default function MargotDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [toolsOpen, setToolsOpen] = useState(true);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/margot/chat" }),
    [],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status: chatStatus,
    error,
  } = useChat({
    transport,
  });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user?.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text?.trim();
    if (!text) return;
    sendMessage({ text });
  };

  const confirmLinearAction = (
    action: "linear_create_issue" | "linear_comment_on_issue",
    pending: Record<string, unknown>,
  ) => {
    const summary =
      action === "linear_create_issue"
        ? `Yes, file it. Call linear_create_issue again with confirmed=true and the same args (title: ${JSON.stringify(
            pending.title,
          )}).`
        : `Yes, post it. Call linear_comment_on_issue again with confirmed=true, issueId ${JSON.stringify(
            pending.issueId,
          )}.`;
    sendMessage({ text: summary });
  };

  const cancelLinearAction = () => {
    sendMessage({ text: "Cancel that — don't file/post it." });
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading {MARGOT_DISPLAY_NAME}…
      </div>
    );
  }

  const isBusy = chatStatus === "submitted" || chatStatus === "streaming";

  return (
    <div className="-mx-2 -my-8 flex min-h-[calc(100dvh-7.5rem)] flex-col sm:-mx-4 lg:-mx-6">
      {/* Page header */}
      <header
        className={cn(
          "shrink-0 border-b px-4 py-4 sm:px-6",
          "bg-white dark:bg-slate-950",
          "border-neutral-200 dark:border-slate-800",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-brand-bronze/30">
              <Image
                src={MARGOT_AVATAR_ORB_PATH}
                alt={`${MARGOT_DISPLAY_NAME} avatar`}
                fill
                className="object-cover"
                sizes="48px"
                priority
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {MARGOT_DISPLAY_NAME}
                </h1>
                <Badge variant="secondary" className="font-normal">
                  Admin
                </Badge>
                <Badge
                  variant="outline"
                  className="gap-1 font-normal text-muted-foreground"
                >
                  <Radio className="h-3 w-3" aria-hidden />
                  Ops assistant
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Briefings, research, Linear, and social-comment training. Use the
                social tools to verify what &quot;restoration&quot; means before
                commenting on posts.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/mission-control">
                Mission Control
                <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/admin">Admin home</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setToolsOpen((v) => !v)}
              aria-pressed={toolsOpen}
            >
              {toolsOpen ? (
                <PanelRightClose className="mr-1.5 h-4 w-4" />
              ) : (
                <PanelRightOpen className="mr-1.5 h-4 w-4" />
              )}
              Social tools
            </Button>
            <Button
              size="sm"
              onClick={() => setMessages([])}
              disabled={isBusy || messages.length === 0}
            >
              <PlusIcon className="mr-1.5 h-4 w-4" />
              New chat
            </Button>
          </div>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Chat column */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden px-3 pt-3 sm:px-4">
            <DashboardPanel
              padded={false}
              className="flex h-full min-h-[420px] flex-col"
            >
              <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5 dark:border-slate-700/60">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Bot className="h-4 w-4 text-brand-bronze" aria-hidden />
                  Conversation
                </div>
                <span className="text-xs text-muted-foreground">
                  {isBusy ? "Margot is working…" : "Ready"}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                <Conversation className="h-full">
                  <ConversationContent>
                    {messages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-10">
                        <ConversationEmptyState
                          title={`What's on your mind?`}
                          description="Ask for a briefing, draft, research sweep, or test a social comment before it goes live."
                        />
                        <div className="flex w-full max-w-xl flex-wrap justify-center gap-2">
                          {STARTER_PROMPTS.map((prompt) => (
                            <Button
                              key={prompt.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto max-w-full whitespace-normal px-3 py-2 text-left text-xs"
                              disabled={isBusy}
                              onClick={() =>
                                sendMessage({ text: prompt.text })
                              }
                            >
                              <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0 text-brand-bronze" />
                              {prompt.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((message) => (
                        <Message from={message.role} key={message.id}>
                          <MessageContent>
                            {message.parts.map((part, i) => {
                              if (part.type === "text") {
                                return message.role === "assistant" ? (
                                  <MessageResponse key={i}>
                                    {part.text}
                                  </MessageResponse>
                                ) : (
                                  <span key={i}>{part.text}</span>
                                );
                              }
                              if (part.type === "tool-linear_list_issues") {
                                return (
                                  <Tool
                                    key={i}
                                    defaultOpen={
                                      part.state !== "output-available"
                                    }
                                  >
                                    <ToolHeader
                                      type="tool-linear_list_issues"
                                      state={part.state}
                                      title="linear_list_issues"
                                    />
                                    <ToolContent>
                                      {(part.state === "input-available" ||
                                        part.state === "output-available" ||
                                        part.state === "output-error") &&
                                      part.input ? (
                                        <ToolInput input={part.input} />
                                      ) : null}
                                      {part.state === "output-available" ? (
                                        <LinearIssueList output={part.output} />
                                      ) : null}
                                      {part.state === "output-error" ? (
                                        <ToolOutput
                                          output={undefined}
                                          errorText={part.errorText}
                                        />
                                      ) : null}
                                    </ToolContent>
                                  </Tool>
                                );
                              }
                              if (
                                part.type === "tool-linear_create_issue" ||
                                part.type === "tool-linear_comment_on_issue"
                              ) {
                                const label =
                                  part.type === "tool-linear_create_issue"
                                    ? "linear_create_issue"
                                    : "linear_comment_on_issue";
                                return (
                                  <Tool
                                    key={i}
                                    defaultOpen={
                                      part.state !== "output-available"
                                    }
                                  >
                                    <ToolHeader
                                      type={part.type}
                                      state={part.state}
                                      title={label}
                                    />
                                    <ToolContent>
                                      {(part.state === "input-available" ||
                                        part.state === "output-available" ||
                                        part.state === "output-error") &&
                                      part.input ? (
                                        <ToolInput input={part.input} />
                                      ) : null}
                                      {part.state === "output-available" ? (
                                        <LinearWriteResult
                                          action={
                                            part.type ===
                                            "tool-linear_create_issue"
                                              ? "linear_create_issue"
                                              : "linear_comment_on_issue"
                                          }
                                          output={part.output}
                                          onConfirm={confirmLinearAction}
                                          onCancel={cancelLinearAction}
                                        />
                                      ) : null}
                                      {part.state === "output-error" ? (
                                        <ToolOutput
                                          output={undefined}
                                          errorText={part.errorText}
                                        />
                                      ) : null}
                                    </ToolContent>
                                  </Tool>
                                );
                              }
                              if (part.type === "tool-image_generate") {
                                const isRunning =
                                  part.state === "input-streaming" ||
                                  part.state === "input-available";
                                return (
                                  <Tool
                                    key={i}
                                    defaultOpen={
                                      part.state !== "output-available"
                                    }
                                  >
                                    <ToolHeader
                                      type="tool-image_generate"
                                      state={part.state}
                                      title="image_generate"
                                    />
                                    <ToolContent>
                                      {isRunning ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                                          Generating image…
                                        </div>
                                      ) : null}
                                      {(part.state === "input-available" ||
                                        part.state === "output-available" ||
                                        part.state === "output-error") &&
                                      part.input ? (
                                        <ToolInput input={part.input} />
                                      ) : null}
                                      {part.state === "output-available" ? (
                                        <ImageGenResult output={part.output} />
                                      ) : null}
                                      {part.state === "output-error" ? (
                                        <ToolOutput
                                          output={undefined}
                                          errorText={part.errorText}
                                        />
                                      ) : null}
                                    </ToolContent>
                                  </Tool>
                                );
                              }
                              if (part.type === "tool-deep_research") {
                                const isRunning =
                                  part.state === "input-streaming" ||
                                  part.state === "input-available";
                                return (
                                  <Tool
                                    key={i}
                                    defaultOpen={
                                      part.state !== "output-available"
                                    }
                                  >
                                    <ToolHeader
                                      type="tool-deep_research"
                                      state={part.state}
                                      title="deep_research"
                                    />
                                    <ToolContent>
                                      {isRunning ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                                          Margot is researching…
                                        </div>
                                      ) : null}
                                      {(part.state === "input-available" ||
                                        part.state === "output-available" ||
                                        part.state === "output-error") &&
                                      part.input ? (
                                        <ToolInput input={part.input} />
                                      ) : null}
                                      {part.state === "output-available" ? (
                                        <ToolOutput
                                          output={part.output}
                                          errorText={undefined}
                                        />
                                      ) : null}
                                      {part.state === "output-error" ? (
                                        <ToolOutput
                                          output={undefined}
                                          errorText={part.errorText}
                                        />
                                      ) : null}
                                    </ToolContent>
                                  </Tool>
                                );
                              }
                              return null;
                            })}
                          </MessageContent>
                        </Message>
                      ))
                    )}
                    {error ? (
                      <div className="mx-4 my-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        Margot hit a snag: {error.message}
                      </div>
                    ) : null}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
              </div>

              <div
                className={cn(
                  "shrink-0 border-t p-3 sm:p-4",
                  "border-neutral-200 dark:border-slate-700/60",
                  "bg-neutral-50/80 dark:bg-slate-900/40",
                )}
              >
                <PromptInput
                  accept="image/*,.pdf"
                  multiple
                  onSubmit={handleSubmit}
                  globalDrop
                >
                  <PromptInputBody>
                    <Attachments />
                    <PromptInputTextarea placeholder="Message Margot… Ask for a briefing, or draft a social comment to test the gate." />
                    <PromptInputFooter>
                      <p className="hidden text-xs text-muted-foreground sm:block">
                        Admin-only · social gate applies to comment drafts
                      </p>
                      <div className="flex-1" />
                      <PromptInputSubmit
                        status={chatStatus}
                        disabled={isBusy}
                      />
                    </PromptInputFooter>
                  </PromptInputBody>
                </PromptInput>
              </div>
            </DashboardPanel>
          </div>
        </section>

        {/* Social tools column */}
        {toolsOpen ? (
          <aside className="flex w-full shrink-0 flex-col border-t border-neutral-200 p-3 dark:border-slate-800 lg:w-[380px] lg:border-t-0 lg:border-l lg:p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-bronze" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">
                Social comments add-on
              </h2>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Phil rule: only engage when restoration means property or
              insurance work. Refuse cars, teeth, and other false matches before
              Hermes posts.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SocialRelevanceTester />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linear tool renderers
// ---------------------------------------------------------------------------

interface LinearIssueListItem {
  id: string;
  identifier: string;
  title: string;
  state: string;
  priority: number;
  assignee: string | null;
  url: string;
}

function priorityToTone(priority: number): { tone: StatusTone; label: string } {
  switch (priority) {
    case 1:
      return { tone: "danger", label: "Urgent" };
    case 2:
      return { tone: "warning", label: "High" };
    case 3:
      return { tone: "info", label: "Medium" };
    case 4:
      return { tone: "neutral", label: "Low" };
    default:
      return { tone: "neutral", label: "None" };
  }
}

function LinearIssueList({ output }: { output: unknown }) {
  if (
    output &&
    typeof output === "object" &&
    "error" in output &&
    typeof (output as { error: unknown }).error === "string"
  ) {
    return (
      <div className="rounded-md border border-destructive-subtle-foreground/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
        {(output as { error: string }).error}
      </div>
    );
  }

  const parsed = output as {
    issues?: LinearIssueListItem[];
    count?: number;
  } | null;
  const issues = parsed?.issues ?? [];

  if (issues.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No Linear issues matched.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {issues.map((issue) => {
        const pri = priorityToTone(issue.priority);
        return (
          <li
            key={issue.id}
            className={cn(
              "flex items-start gap-3 rounded-md border px-3 py-2",
              dashboardSurfaceClass,
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-medium">
                  {issue.identifier}
                </span>
                <StatusBadge tone={pri.tone}>{pri.label}</StatusBadge>
                <StatusBadge tone="neutral">{issue.state}</StatusBadge>
              </div>
              <div className="truncate text-sm font-medium">{issue.title}</div>
              <div className="text-xs text-muted-foreground">
                {issue.assignee ? `Assignee: ${issue.assignee}` : "Unassigned"}
              </div>
            </div>
            <a
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              Linear
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

interface LinearConfirmationOutput {
  requiresConfirmation: true;
  action: "linear_create_issue" | "linear_comment_on_issue";
  pending: Record<string, unknown>;
  message: string;
}

function isConfirmation(v: unknown): v is LinearConfirmationOutput {
  return (
    !!v &&
    typeof v === "object" &&
    "requiresConfirmation" in v &&
    (v as { requiresConfirmation: unknown }).requiresConfirmation === true
  );
}

function LinearWriteResult({
  action,
  output,
  onConfirm,
  onCancel,
}: {
  action: "linear_create_issue" | "linear_comment_on_issue";
  output: unknown;
  onConfirm: (
    action: "linear_create_issue" | "linear_comment_on_issue",
    pending: Record<string, unknown>,
  ) => void;
  onCancel: () => void;
}) {
  if (isConfirmation(output)) {
    const verb =
      output.action === "linear_create_issue" ? "create" : "comment on";
    return (
      <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="mb-2 font-medium">Confirm: {verb} Linear issue?</div>
        <pre className="mb-3 max-h-48 overflow-auto rounded-md border bg-background p-2 text-xs">
          {JSON.stringify(output.pending, null, 2)}
        </pre>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onConfirm(action, output.pending)}>
            Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (
    output &&
    typeof output === "object" &&
    "error" in output &&
    typeof (output as { error: unknown }).error === "string"
  ) {
    return (
      <div className="rounded-md border border-destructive-subtle-foreground/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
        {(output as { error: string }).error}
      </div>
    );
  }

  const parsed = output as {
    identifier?: string;
    id?: string;
    url?: string;
  } | null;

  if (parsed?.url) {
    return (
      <div className="rounded-md border border-success-subtle-foreground/30 bg-success-subtle px-3 py-2 text-sm text-success-subtle-foreground">
        Done.{" "}
        {parsed.identifier ? (
          <span className="font-mono">{parsed.identifier}</span>
        ) : null}{" "}
        <a
          href={parsed.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Open in Linear
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <pre className="max-h-48 overflow-auto rounded-md border bg-background p-2 text-xs">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Image generation renderer
// ---------------------------------------------------------------------------

interface ImageGenOutput {
  image_url?: string;
  prompt?: string;
  model?: string;
  aspect_ratio?: string;
  image_size?: string;
  cost_usd_approx?: number;
  error?: string;
}

function ImageGenResult({ output }: { output: unknown }) {
  const data = (output ?? {}) as ImageGenOutput;

  if (data.error) {
    return (
      <div className="rounded-md border border-destructive-subtle-foreground/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
        {data.error}
      </div>
    );
  }

  if (!data.image_url) {
    return (
      <pre className="max-h-48 overflow-auto rounded-md border bg-background p-2 text-xs">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  }

  const promptExcerpt =
    data.prompt && data.prompt.length > 140
      ? `${data.prompt.slice(0, 140)}…`
      : (data.prompt ?? "");

  return (
    <figure
      className={cn(
        "flex flex-col gap-2 rounded-md border p-2",
        dashboardSurfaceClass,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote gen URL */}
      <img
        src={data.image_url}
        alt={promptExcerpt || "Generated image"}
        className="max-h-[480px] w-full rounded-sm object-contain"
      />
      <figcaption className="text-xs text-muted-foreground">
        <span className="italic">{promptExcerpt}</span>
        <br />
        Generated with Nano Banana 2 · {data.image_size ?? "1K"}
      </figcaption>
    </figure>
  );
}
