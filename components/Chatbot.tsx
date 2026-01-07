"use client"

import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import ReactMarkdown from "react-markdown"
import { useSession } from "next-auth/react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

const SUGGESTED_QUESTIONS = [
  "How do I create a new inspection report?",
  "What is the difference between Scope of Works and Cost Estimation?",
  "How do I upload a PDF inspection report?",
  "What standards does Restore Assist use for compliance?",
  "How do I configure equipment pricing?",
  "Can you explain the 8-step workflow?",
  "How do I generate a Scope of Works document?",
  "What is the NIR system and how does it work?",
]

export default function Chatbot() {
  const { data: session } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const userName = session?.user?.name || "there"

  // Load chat history from database
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        setIsLoadingHistory(true)
        const response = await fetch("/api/chatbot")
        if (response.ok) {
          const data = await response.json()
          if (data.messages && data.messages.length > 0) {
            // Convert timestamp strings to Date objects
            const formattedMessages = data.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
            setMessages(formattedMessages)
          } else {
            // No chat history, show welcome message with user's name
            const welcomeName = session?.user?.name || "there"
            setMessages([
              {
                id: "welcome",
                role: "assistant",
                content: `Hello ${welcomeName}! I'm your Restore Assist AI assistant. How can I help you today? I can assist with questions about water damage restoration, report generation, equipment selection, compliance standards, and more.`,
                timestamp: new Date(),
              },
            ])
          }
        }
      } catch (error) {
        console.error("Error loading chat history:", error)
        // Show welcome message on error
        const welcomeName = session?.user?.name || "there"
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Hello ${welcomeName}! I'm your Restore Assist AI assistant. How can I help you today? I can assist with questions about water damage restoration, report generation, equipment selection, compliance standards, and more.`,
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsLoadingHistory(false)
      }
    }

    if (session) {
      loadChatHistory()
    }
  }, [session])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to get response")
      }

      const data = await response.json()
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      toast.error(error.message || "Failed to send message")
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I'm having trouble processing your request right now. Please try again later.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestedQuestion = async (question: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: question,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      // Get current messages including the new one
      const currentMessages = [...messages, userMessage]
      
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: currentMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to get response")
      }

      const data = await response.json()
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      toast.error(error.message || "Failed to send message")
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I'm having trouble processing your request right now. Please try again later.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Show suggested questions only when there's just the welcome message or no messages
  const showSuggestedQuestions = messages.length === 0 || (messages.length === 1 && messages[0].id === "welcome")

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center z-[100] group"
        style={{ position: 'fixed' }}
        aria-label="Open chatbot"
      >
        {isOpen ? (
          <X className="text-white" size={24} />
        ) : (
          <MessageCircle className="text-white" size={24} />
        )}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full animate-pulse"></span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl flex flex-col z-[100] animate-fade-in" style={{ position: 'fixed' }}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/50 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                <MessageCircle className="text-white" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-white">AI Assistant</h3>
                <p className="text-xs text-slate-400">Restore Assist Support</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
              aria-label="Close chatbot"
            >
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Suggested Questions - Show when there's only welcome message */}
            {showSuggestedQuestions && (
              <div className="space-y-2 mb-4">
                <p className="text-xs text-slate-400 mb-2">Suggested questions:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedQuestion(question)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      : "bg-slate-700 text-slate-100"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="text-sm prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc flex list-inside mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal flex flex-col list-inside mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="ml-2">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children }) => (
                            <code className="bg-slate-800/50 px-1.5 py-0.5 rounded text-xs font-mono">
                              {children}
                            </code>
                          ),
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-slate-500 pl-3 my-2 italic">
                              {children}
                            </blockquote>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                  <p className="text-xs mt-1 opacity-70">
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
                <div className="bg-slate-700 rounded-lg px-4 py-2">
                  <Loader2 className="animate-spin text-cyan-400" size={16} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-700 bg-slate-900/50 rounded-b-lg">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-white placeholder-slate-400 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin text-white" size={18} />
                ) : (
                  <Send className="text-white" size={18} />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  )
}

