"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { MessageCircle, Send, User, Bot, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

interface Message {
  role: "client" | "system"
  content: string
  timestamp: Date
}

interface ClientQnAProps {
  onConversationComplete?: (conversation: Message[]) => void
  initialMessages?: Message[]
}

export default function ClientQnA({ onConversationComplete, initialMessages = [] }: ClientQnAProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const conversationStarted = useRef(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Start conversation with initial question if no messages
  useEffect(() => {
    if (messages.length === 0 && !conversationStarted.current) {
      conversationStarted.current = true
      setMessages([{
        role: "system",
        content: "Hello! I'm here to help you report the issue. Can you please describe what happened?",
        timestamp: new Date()
      }])
    }
  }, [])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const clientMessage: Message = {
      role: "client",
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, clientMessage])
    setInput("")
    setIsLoading(true)

    try {
      // Get AI-generated follow-up question
      const response = await fetch("/api/reports/generate-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversation: [...messages, clientMessage].map(m => ({
            role: m.role === "client" ? "user" : "assistant",
            content: m.content
          }))
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to generate question")
      }

      const data = await response.json()
      
      if (data.isComplete) {
        // Conversation is complete
        setIsComplete(true)
        const finalMessage: Message = {
          role: "system",
          content: data.question || "Thank you for providing all the information. A technician will review your case and contact you soon.",
          timestamp: new Date()
        }
        setMessages(prev => [...prev, finalMessage])
        
        if (onConversationComplete) {
          onConversationComplete([...messages, clientMessage, finalMessage])
        }
        toast.success("Conversation complete! All information has been collected.")
      } else {
        // Add follow-up question
        const systemMessage: Message = {
          role: "system",
          content: data.question,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, systemMessage])
      }
    } catch (error: any) {
      console.error("Error generating question:", error)
      toast.error(error.message || "Failed to generate question")
      
      // Add a fallback question
      const fallbackMessage: Message = {
        role: "system",
        content: "Thank you for that information. Is there anything else you'd like to add?",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, fallbackMessage])
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

  const handleCompleteManually = () => {
    setIsComplete(true)
    if (onConversationComplete) {
      onConversationComplete(messages)
    }
    toast.success("Conversation marked as complete!")
  }

  return (
    <Card className="border-slate-700 bg-slate-800/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <MessageCircle className="h-5 w-5 text-cyan-400" />
          Client Information Gathering
        </CardTitle>
        <CardDescription className="text-slate-300">
          Ask questions to gather information about the incident. The system will automatically generate follow-up questions based on the client's responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages */}
        <div className="h-[400px] overflow-y-auto space-y-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "client" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "system" && (
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-cyan-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "client"
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-700 text-slate-200"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs mt-1 opacity-70">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {message.role === "client" && (
                <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-slate-300" />
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="bg-slate-700 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isComplete && (
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type client's response here..."
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        {/* Complete Button */}
        {!isComplete && messages.length > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={handleCompleteManually}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Mark as Complete
            </Button>
          </div>
        )}

        {/* Complete Status */}
        {isComplete && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-400 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Conversation complete. All information has been collected.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

