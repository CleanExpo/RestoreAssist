/**
 * RA-7026 Phase 2 (inc 3) — contractor assistant chat UI.
 *
 * Read-only domain assistant: streams from /api/assistant/chat (session +
 * subscription gated server-side). No tools, no attachments — text in, grounded
 * answer out. Mirrors the proven useChat + ai-elements wiring from the personal
 * Margot page, minus every tool renderer.
 */

"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

const NAVY = "#1C2E47";
const WARM = "#8A6B4E";

export default function AssistantChat() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/assistant/chat" }),
    [],
  );

  const { messages, sendMessage, status: chatStatus, error } = useChat({
    transport,
  });

  // Any signed-in user may use it — the API enforces the subscription gate.
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text?.trim();
    if (!text) return;
    sendMessage({ text });
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading assistant…
      </div>
    );
  }

  const isBusy = chatStatus === "submitted" || chatStatus === "streaming";

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col bg-background">
      <header
        className="flex h-14 shrink-0 items-center gap-3 border-b px-6"
        style={{ borderColor: "#E7E0D3" }}
      >
        <span
          className="inline-block h-6 w-1.5 rounded-full"
          style={{ backgroundImage: `linear-gradient(${NAVY}, ${WARM})` }}
        />
        <div>
          <h1 className="text-lg font-semibold" style={{ color: NAVY }}>
            RestoreAssist Assistant
          </h1>
          <p className="text-xs text-muted-foreground">
            IICRC S500 guidance · your pricing · your recent work · read-only
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Conversation>
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Ask the RestoreAssist assistant"
                description="Grounded on IICRC S500/S520, your configured pricing, and your own recent jobs. Try: 'What does S500 require for Category 3 water?' or 'What's my call-out rate?'"
              />
            ) : (
              messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, i) =>
                      part.type === "text" ? (
                        message.role === "assistant" ? (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        ) : (
                          <span key={i}>{part.text}</span>
                        )
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
            {error ? (
              <div
                className="mx-4 my-2 rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "#B33A3A", color: "#B33A3A" }}
              >
                The assistant hit a snag: {error.message}
              </div>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="border-t p-4" style={{ borderColor: "#E7E0D3" }}>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about a standard, your pricing, or your recent jobs…" />
            <PromptInputFooter>
              <div className="flex-1" />
              <PromptInputSubmit status={chatStatus} disabled={isBusy} />
            </PromptInputFooter>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}
