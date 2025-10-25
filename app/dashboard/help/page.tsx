"use client"

import { ChevronDown, Mail, Phone, MessageSquare, BookOpen, Video } from "lucide-react"
import { useState } from "react"

export default function HelpPage() {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  const faqs = [
    {
      id: "1",
      question: "How do I create a new report?",
      answer:
        "Click the 'New Report' button in the sidebar. Follow the 8-step workflow to complete your report. You can save drafts at any time and return to them later.",
    },
    {
      id: "2",
      question: "What hazard types are supported?",
      answer:
        "Restore Assist supports all major hazard types: Water damage, Fire damage, Storm damage, Flood damage, Mould, Biohazard, and Impact damage. Each has specific compliance requirements.",
    },
    {
      id: "3",
      question: "How do I integrate with Ascora CRM?",
      answer:
        "Go to Settings > Integrations and click 'Connect' on the Ascora CRM card. You'll need your Ascora API credentials. Once connected, reports will automatically sync.",
    },
    {
      id: "4",
      question: "Can I customize cost libraries?",
      answer:
        "Yes! Go to Cost Libraries and select a library to edit. You can modify rates, add new items, or create custom libraries for different regions.",
    },
    {
      id: "5",
      question: "How is my data protected?",
      answer:
        "All data is encrypted in transit and at rest. We comply with Australian Privacy Act and maintain regular security audits. Your data is never shared with third parties.",
    },
  ]

  const supportChannels = [
    {
      icon: Mail,
      title: "Email Support",
      description: "support@Restore Assist.com",
      response: "24-48 hours",
    },
    {
      icon: Phone,
      title: "Phone Support",
      description: "+61 2 9876 5432",
      response: "Business hours",
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      description: "Available in app",
      response: "9am-5pm AEST",
    },
  ]

  const resources = [
    {
      icon: BookOpen,
      title: "Documentation",
      description: "Complete guides and references",
    },
    {
      icon: Video,
      title: "Video Tutorials",
      description: "Step-by-step video guides",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold mb-2">Help & Support</h1>
        <p className="text-slate-400">Find answers and get support for Restore Assist</p>
      </div>

      {/* Support Channels */}
      <div className="grid md:grid-cols-3 gap-4">
        {supportChannels.map((channel, i) => {
          const Icon = channel.icon
          return (
            <div
              key={i}
              className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 transition-all"
            >
              <Icon size={24} className="text-cyan-400 mb-3" />
              <h3 className="font-semibold mb-1">{channel.title}</h3>
              <p className="text-sm text-slate-400 mb-3">{channel.description}</p>
              <p className="text-xs text-slate-500">Response: {channel.response}</p>
            </div>
          )
        })}
      </div>

      {/* Resources */}
      <div className="grid md:grid-cols-2 gap-4">
        {resources.map((resource, i) => {
          const Icon = resource.icon
          return (
            <button
              key={i}
              className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 transition-all text-left group"
            >
              <Icon size={24} className="text-cyan-400 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold mb-1">{resource.title}</h3>
              <p className="text-sm text-slate-400">{resource.description}</p>
            </button>
          )
        })}
      </div>

      {/* FAQs */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <div key={faq.id} className="border border-slate-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors text-left"
              >
                <span className="font-medium">{faq.question}</span>
                <ChevronDown
                  size={20}
                  className={`transition-transform ${expandedFaq === faq.id ? "rotate-180" : ""}`}
                />
              </button>
              {expandedFaq === faq.id && (
                <div className="p-4 bg-slate-700/20 border-t border-slate-700/50">
                  <p className="text-slate-300">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
