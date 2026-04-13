"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Globe,
} from "lucide-react";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import { useSession } from "next-auth/react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Language {
  code: string;
  label: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: "en-AU", label: "English (AU)", flag: "🇦🇺" },
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
  { code: "zh-CN", label: "中文", flag: "🇨🇳" },
  { code: "vi-VN", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ar-SA", label: "العربية", flag: "🇸🇦" },
  { code: "es-ES", label: "Español", flag: "🇪🇸" },
  { code: "hi-IN", label: "हिन्दी", flag: "🇮🇳" },
  { code: "pt-BR", label: "Português", flag: "🇧🇷" },
];

const SUGGESTED_QUESTIONS = [
  "How do I create a new inspection report?",
  "What is the difference between Scope of Works and Cost Estimation?",
  "How do I upload a PDF inspection report?",
  "What standards does Restore Assist use for compliance?",
  "How do I configure equipment pricing?",
  "Can you explain the 8-step workflow?",
  "How do I generate a Scope of Works document?",
  "What is the NIR system and how does it work?",
];

// Minimal Web Speech API type declarations (not in TS stdlib by default)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export default function Chatbot() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Language state
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    LANGUAGES[0],
  );
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  const userName = session?.user?.name || "there";

  // Close language menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(e.target as Node)
      ) {
        setShowLanguageMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cancel speech on unmount / close
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
      recognitionRef.current?.stop();
    };
  }, []);

  // Load chat history from database
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const response = await fetch("/api/chatbot");
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            const formattedMessages = data.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }));
            setMessages(formattedMessages);
          } else {
            const welcomeName = session?.user?.name || "there";
            setMessages([
              {
                id: "welcome",
                role: "assistant",
                content: `Hello ${welcomeName}! I'm your Restore Assist AI assistant. How can I help you today? I can assist with questions about water damage restoration, report generation, equipment selection, compliance standards, and more.`,
                timestamp: new Date(),
              },
            ]);
          }
        }
      } catch {
        const welcomeName = session?.user?.name || "there";
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Hello ${welcomeName}! I'm your Restore Assist AI assistant. How can I help you today? I can assist with questions about water damage restoration, report generation, equipment selection, compliance standards, and more.`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    if (session) {
      loadChatHistory();
    }
  }, [session]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Text-to-speech: strip markdown and speak
  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled || typeof window === "undefined") return;
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      const plainText = text
        .replace(/#{1,6}\s/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`{1,3}[^`]*`{1,3}/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^[-*+]\s/gm, "")
        .trim();
      if (!plainText) return;
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.lang = selectedLanguage.code;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [voiceEnabled, selectedLanguage.code],
  );

  const stopSpeaking = () => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  // Speech-to-text
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error(
        "Speech recognition is not supported in this browser. Try Chrome.",
      );
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    const recognition = new SR();
    recognition.lang = selectedLanguage.code;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0];
      const transcript = result[0].transcript;
      setInput(transcript);
      // Auto-submit on final result
      if (result.isFinal && transcript.trim()) {
        setIsListening(false);
        recognitionRef.current = null;
        // Small delay so input state settles
        setTimeout(() => {
          setInput((prev) => {
            if (prev.trim()) {
              sendMessage(prev.trim());
              return "";
            }
            return prev;
          });
        }, 100);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        toast.error(`Voice error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [selectedLanguage.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      speak(data.response);
    } catch (error: any) {
      toast.error(error.message || "Failed to send message");
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I apologize, but I'm having trouble processing your request right now. Please try again later.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    await sendMessage(text);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedQuestion = async (question: string) => {
    await sendMessage(question);
  };

  const showSuggestedQuestions =
    messages.length === 0 ||
    (messages.length === 1 && messages[0].id === "welcome");

  const currentLang = selectedLanguage;

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center z-[100] group"
        style={{ position: "fixed" }}
        aria-label="Open chatbot"
      >
        {isOpen ? (
          <X className="text-white" size={24} />
        ) : (
          <MessageCircle className="text-white" size={24} />
        )}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full animate-pulse" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 w-96 h-[600px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-2xl flex flex-col z-[100] animate-fade-in"
          style={{ position: "fixed" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                <MessageCircle className="text-white" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  AI Assistant
                </h3>
                <p className="text-xs text-gray-600 dark:text-slate-400">
                  Restore Assist Support
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Language selector */}
              <div className="relative" ref={languageMenuRef}>
                <button
                  onClick={() => setShowLanguageMenu((v) => !v)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors flex items-center gap-1"
                  title="Select language"
                  aria-label="Select language"
                >
                  <span className="text-sm">{currentLang.flag}</span>
                  <Globe
                    size={14}
                    className="text-gray-600 dark:text-slate-400"
                  />
                </button>
                {showLanguageMenu && (
                  <div className="absolute right-0 top-8 w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-10 overflow-hidden">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setSelectedLanguage(lang);
                          setShowLanguageMenu(false);
                          stopSpeaking();
                          stopListening();
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                          selectedLanguage.code === lang.code
                            ? "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 font-medium"
                            : "text-gray-700 dark:text-slate-300"
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TTS toggle */}
              <button
                onClick={() => {
                  if (voiceEnabled) {
                    stopSpeaking();
                    setVoiceEnabled(false);
                  } else {
                    setVoiceEnabled(true);
                  }
                }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                title={
                  voiceEnabled ? "Mute responses" : "Speak responses aloud"
                }
                aria-label={
                  voiceEnabled
                    ? "Disable voice responses"
                    : "Enable voice responses"
                }
              >
                {voiceEnabled ? (
                  isSpeaking ? (
                    <Volume2
                      size={16}
                      className="text-cyan-500 animate-pulse"
                    />
                  ) : (
                    <Volume2 size={16} className="text-cyan-500" />
                  )
                ) : (
                  <VolumeX
                    size={16}
                    className="text-gray-400 dark:text-slate-500"
                  />
                )}
              </button>

              {/* Close */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  stopSpeaking();
                  stopListening();
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                aria-label="Close chatbot"
              >
                <X size={18} className="text-gray-600 dark:text-slate-400" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {showSuggestedQuestions && (
              <div className="space-y-2 mb-4">
                <p className="text-xs text-gray-600 dark:text-slate-400 mb-2">
                  Suggested questions:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedQuestion(question)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                      : "bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0 text-gray-900 dark:text-slate-100">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside mb-2 space-y-1 text-gray-900 dark:text-slate-100">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside mb-2 space-y-1 text-gray-900 dark:text-slate-100">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="ml-2 text-gray-900 dark:text-slate-100">
                              {children}
                            </li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-gray-900 dark:text-slate-100">
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic text-gray-900 dark:text-slate-100">
                              {children}
                            </em>
                          ),
                          code: ({ children }) => (
                            <code className="bg-gray-200 dark:bg-slate-800/50 px-1.5 py-0.5 rounded text-xs font-mono text-gray-900 dark:text-slate-100">
                              {children}
                            </code>
                          ),
                          h1: ({ children }) => (
                            <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0 text-gray-900 dark:text-slate-100">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-base font-bold mb-2 mt-3 first:mt-0 text-gray-900 dark:text-slate-100">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0 text-gray-900 dark:text-slate-100">
                              {children}
                            </h3>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-gray-400 dark:border-slate-500 pl-3 my-2 italic text-gray-800 dark:text-slate-200">
                              {children}
                            </blockquote>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </p>
                  )}
                  <p className="text-xs mt-1 opacity-70 text-gray-700 dark:text-slate-300">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-slate-700 rounded-lg px-4 py-2">
                  <Loader2
                    className="animate-spin text-cyan-500 dark:text-cyan-400"
                    size={16}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 rounded-b-lg">
            {/* Listening indicator */}
            {isListening && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-cyan-500 rounded-full animate-pulse"
                      style={{
                        height: "12px",
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-cyan-500 font-medium">
                  Listening ({currentLang.flag} {currentLang.label})…
                </span>
              </div>
            )}

            <div className="flex gap-2">
              {/* Mic button */}
              <button
                onClick={toggleListening}
                disabled={isLoading}
                className={`px-3 py-2 rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                  isListening
                    ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30"
                    : "bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600"
                }`}
                title={
                  isListening
                    ? "Stop listening"
                    : `Speak (${currentLang.label})`
                }
                aria-label={
                  isListening ? "Stop voice input" : "Start voice input"
                }
              >
                {isListening ? (
                  <MicOff size={18} className="text-white" />
                ) : (
                  <Mic
                    size={18}
                    className="text-gray-600 dark:text-slate-300"
                  />
                )}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  isListening
                    ? "Listening…"
                    : `Type or speak in ${currentLang.label}…`
                }
                disabled={isLoading || isListening}
                className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 disabled:opacity-50"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                aria-label="Send message"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin text-white" size={18} />
                ) : (
                  <Send className="text-white" size={18} />
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
              Press Enter to send · Mic to speak · {currentLang.flag}{" "}
              {currentLang.label}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
