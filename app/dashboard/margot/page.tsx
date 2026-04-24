/**
 * RA-1652 — Margot dashboard (v1).
 *
 * Web chat UI that talks to Claude with Margot's persona so Phill can reach
 * the same voice from the browser, not just Telegram. v1 routes directly to
 * Claude via /api/margot/chat; the Hermes bridge (RA-1630) lands later.
 *
 * Layout: left sidebar (240px) → main conversation → bottom prompt input.
 * File upload UI ships, but the v1 backend ignores attachments.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { PlusIcon, LinkIcon } from "lucide-react";
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

const RECENT_THREADS_STUB = [
  { id: "t1", title: "Week-ahead briefing", preview: "3 focus items for the week…" },
  { id: "t2", title: "NRPG pricing sweep", preview: "Corpus + public research merged." },
  { id: "t3", title: "RA-1645 triage", preview: "Pi-CEO MCP connection flake." },
];

export default function MargotDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/margot/chat" }),
    [],
  );

  const { messages, sendMessage, status: chatStatus, error } = useChat({
    transport,
  });

  // Auth gate — matches the pattern in app/dashboard/admin/page.tsx.
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

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text?.trim();
    if (!text) return;
    sendMessage({ text });
  };

  if (status === "loading" || !session) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: "#F5F0E8", color: "#141413" }}
      >
        <span className="text-base">Loading Margot…</span>
      </div>
    );
  }

  const isBusy = chatStatus === "submitted" || chatStatus === "streaming";

  return (
    <div
      className="flex h-[calc(100vh-4rem)] w-full"
      style={{
        backgroundColor: "#F5F0E8",
        color: "#141413",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "16px",
      }}
    >
      {/* Left sidebar */}
      <aside
        className="flex h-full w-[240px] shrink-0 flex-col border-r"
        style={{ borderColor: "#E7E0D3", backgroundColor: "#EFE7D5" }}
      >
        <div className="px-5 pt-5 pb-3">
          <h2
            className="text-xl"
            style={{ fontFamily: "Georgia, serif", fontWeight: 600 }}
          >
            🐕 Margot
          </h2>
        </div>
        <div className="px-4 pb-4">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setActiveThreadId(null);
              window.location.reload();
            }}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            New chat
          </Button>
        </div>
        <div className="px-5 pt-2 pb-2 text-xs uppercase tracking-wide opacity-60">
          Recent
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          {RECENT_THREADS_STUB.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveThreadId(t.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                activeThreadId === t.id ? "bg-[#E1D6BE]" : "hover:bg-[#E7DFCA]"
              }`}
            >
              <div className="truncate font-medium">{t.title}</div>
              <div className="truncate text-xs opacity-60">{t.preview}</div>
            </button>
          ))}
        </nav>
        <div className="border-t px-4 py-3 text-xs opacity-60" style={{ borderColor: "#E7E0D3" }}>
          v1 · Claude + Margot persona
        </div>
      </aside>

      {/* Main column */}
      <div className="flex h-full flex-1 flex-col">
        {/* Top bar */}
        <header
          className="flex h-14 shrink-0 items-center justify-between border-b px-6"
          style={{ borderColor: "#E7E0D3", backgroundColor: "#F5F0E8" }}
        >
          <h1
            className="text-2xl"
            style={{ fontFamily: "Georgia, serif", fontWeight: 600 }}
          >
            Margot
          </h1>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: "#141413", color: "#141413" }}
          >
            <LinkIcon className="h-3 w-3" />
            linked to @piceo247agent_bot
          </span>
        </header>

        {/* Conversation */}
        <div className="flex-1 overflow-hidden">
          <Conversation>
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState
                  title="What's on your mind, Phill?"
                  description="Margot's bulldog-on-a-bone. Ask for a briefing, a draft, a research sweep, or route a build to Pi-CEO."
                />
              ) : (
                messages.map((message) => (
                  <Message from={message.role} key={message.id}>
                    <MessageContent>
                      {message.parts.map((part, i) => {
                        if (part.type === "text") {
                          return message.role === "assistant" ? (
                            <MessageResponse key={i}>{part.text}</MessageResponse>
                          ) : (
                            <span key={i}>{part.text}</span>
                          );
                        }
                        if (part.type === "tool-deep_research") {
                          const isRunning =
                            part.state === "input-streaming" ||
                            part.state === "input-available";
                          return (
                            <Tool key={i} defaultOpen={part.state !== "output-available"}>
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
                <div
                  className="mx-4 my-2 rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "#B33A3A", color: "#B33A3A" }}
                >
                  Margot hit a snag: {error.message}
                </div>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>

        {/* Prompt input */}
        <div className="border-t p-4" style={{ borderColor: "#E7E0D3" }}>
          <PromptInput
            accept="image/*,.pdf"
            multiple
            onSubmit={handleSubmit}
            globalDrop
          >
            <PromptInputBody>
              <Attachments />

              <PromptInputTextarea placeholder="What's on your mind, Phill?" />
              <PromptInputFooter>
                <div className="flex-1" />
                <PromptInputSubmit status={chatStatus} disabled={isBusy} />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
