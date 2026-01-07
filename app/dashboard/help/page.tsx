"use client"

import { ChevronDown, Mail, Phone, MessageSquare, BookOpen, Video } from "lucide-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"

export default function HelpPage() {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  const faqs = [
    {
      id: "1",
      question: "How do I create a new report in Restore Assist?",
      answer:
        "Click the 'New Report' button in the sidebar (highlighted in blue). This takes you to /dashboard/reports/new where you'll follow the 8-step workflow: (1) Initial Data Entry - Enter client, property, and incident details, (2) Technician Report - Capture measurements, photos, and observations, (3) AI Analysis - System automatically analyzes technician data, (4) Tier 1 Questions - Initial assessment questions, (5) Tier 2 Questions - Detailed technical questions, (6) Tier 3 Questions - Advanced configuration questions, (7) Report Generation - Generate Inspection Report, Scope of Works, and Cost Estimation, (8) Review & Finalize - Review and export reports. You can save drafts at any step and return later.",
    },
    {
      id: "2",
      question: "What report types does Restore Assist generate?",
      answer:
        "Restore Assist generates three professional report types: (1) **Inspection Report** - Comprehensive damage assessment with photos, measurements, and analysis. Uses standards from Google Drive IICRC Standards folder for compliance. (2) **Scope of Works** - Detailed scope document with cover page, affected areas, drying duration, and equipment deployment. (3) **Cost Estimation** - Professional cost breakdown with line items, equipment costs, and totals including GST. All reports are IICRC S500 compliant and meet NCC 2022 and Australian standards.",
    },
    {
      id: "3",
      question: "How does PDF upload and parsing work?",
      answer:
        "In the Initial Data Entry form, you can upload inspection reports from other systems (Xactimate, Symbility, Matterport, DASH, Encircle, etc.). Restore Assist automatically parses the PDF using text extraction, extracts all relevant data (client name, property address, claim reference, dates, water category/class, moisture readings, equipment deployment, etc.), and populates the form fields automatically. This saves time when migrating reports from other systems.",
    },
    {
      id: "4",
      question: "How do I configure Cost Libraries and Pricing?",
      answer:
        "Go to **Pricing Configuration** (/dashboard/pricing-config) to set up your company's pricing structure. Then go to **Cost Libraries** (/dashboard/cost-libraries) to manage regional pricing libraries. You can: (1) Select a library to edit equipment rates, material costs, and labor rates, (2) Modify existing rates for different regions, (3) Add new items to libraries, (4) Create custom libraries for specific regions or job types. These libraries are used automatically when generating Cost Estimations.",
    },
    {
      id: "5",
      question: "How does the Claims Analysis feature work?",
      answer:
        "The **Claims Analysis** feature (/dashboard/claims-analysis) allows you to analyze Google Drive folders containing completed claim reports. It performs gap analysis to identify: (1) Compliance gaps against IICRC and Australian standards, (2) Missing elements in reports, (3) Revenue recovery opportunities, (4) Standardization issues. The system retrieves standards from Google Drive IICRC Standards folder, analyzes each PDF, and provides detailed reports showing what's missing and estimated missing revenue. This helps improve report quality and maximize billing.",
    },
    {
      id: "6",
      question: "How do I set up AI integrations?",
      answer:
        "Go to **Integrations** (/dashboard/integrations) to connect your AI API keys. Currently, **Anthropic Claude** is available for use. OpenAI and Gemini are marked as 'Coming Soon' and cannot be added yet. To add Anthropic: (1) Click 'Connect' on the Anthropic card, (2) Enter your Anthropic API key, (3) The system will verify and save it. This API key is used for report generation, standards retrieval from Google Drive, and the chatbot feature. The chatbot uses the ANTHROPIC_API_KEY from environment variables.",
    },
    {
      id: "7",
      question: "What is the NIR (National Inspection Report) System?",
      answer:
        "The NIR system in Restore Assist provides structured data collection for technicians. It includes: (1) **Moisture Readings** - Capture moisture levels by location, surface type, and depth, (2) **Affected Areas** - Room-by-room breakdown with dimensions, wet percentages, and water source, (3) **Scope Items** - Pre-defined scope items like remove_carpet, install_dehumidification, extract_standing_water, etc. This structured data is automatically used in report generation and ensures consistency across all reports.",
    },
    {
      id: "8",
      question: "How does Psychrometric Assessment work?",
      answer:
        "Restore Assist automatically calculates drying requirements using psychrometric data. Enter temperature, humidity, and water class, and the system calculates: (1) Equipment needs (dehumidifiers, air movers), (2) Drying duration estimates, (3) Target humidity and temperature settings, (4) Equipment placement recommendations. This data is used in both the Scope of Works and Cost Estimation reports. The calculations follow IICRC S500 standards.",
    },
    {
      id: "9",
      question: "How are standards retrieved for report generation?",
      answer:
        "When generating Inspection Reports, Restore Assist automatically retrieves relevant IICRC standards from a Google Drive folder (IICRC Standards). The system: (1) Analyzes your report type (water, mould, fire, commercial), (2) Identifies relevant standards based on water category, class, materials, and keywords, (3) Downloads and extracts text from relevant standard documents, (4) Uses AI to identify relevant sections, (5) Includes these standards in the report generation prompt. The AI then references and cites specific sections from these standards throughout the report. This ensures compliance with IICRC S500, NCC 2022, and Australian standards.",
    },
    {
      id: "10",
      question: "How do I manage clients in Restore Assist?",
      answer:
        "Go to **Clients** (/dashboard/clients) to manage your client database. You can: (1) Add new clients with contact details, company information, and notes, (2) View client statistics including total reports, total revenue, and last job date, (3) See clients created from reports (marked as 'From Report') that can be converted to full client records, (4) Search and filter clients by name, email, phone, or company, (5) View all reports associated with each client. Client data is automatically linked to reports when you create them.",
    },
    {
      id: "11",
      question: "What compliance standards does Restore Assist support?",
      answer:
        "Restore Assist ensures compliance with: (1) **IICRC S500** - Water damage restoration standards (retrieved from Google Drive), (2) **NCC 2022** - National Construction Code compliance, (3) **AS/NZS Standards** - Australian and New Zealand standards (AS/NZS 3000 electrical, AS 1668 HVAC, AS/NZS 3666 air systems), (4) **WHS/OH&S** - Work Health and Safety requirements, (5) **Australian Privacy Act** - Data protection compliance, (6) **Major Australian Insurance Providers** - Requirements for Suncorp, IAG, Allianz, QBE, etc. All reports are automatically checked for compliance during generation.",
    },
    {
      id: "12",
      question: "How do I use the Chatbot feature?",
      answer:
        "The chatbot is available as a floating button in the bottom-right corner of all dashboard pages. Click it to open the chat window. The chatbot: (1) Answers questions specifically about Restore Assist features and workflows, (2) Guides you through the 8-step report creation process, (3) Explains how to use specific dashboard features, (4) Provides guidance on Australian restoration standards and compliance, (5) Stores all conversations in the database for history. The chatbot uses Anthropic Claude API and is specifically trained on Restore Assist features, not generic restoration advice.",
    },
  ]

  const supportChannels = [
    {
      icon: Mail,
      title: "Email Support",
      description: "airestoreassist@gmail.com",
      response: "24-48 hours",
    },
    {
      icon: MessageSquare,
      title: "Live Chat ",
      description: "Available in app",
      response: "Available 24/7",
    },
  ]

  const resources = [
    {
      icon: BookOpen,
      title: "Documentation (Coming Soon)",
      description: "Complete guides and references",
    },
    {
      icon: Video,
      title: "Video Tutorials (Coming Soon)",
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
              <div className="flex items-center gap-3">
                <Icon size={24} className="text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <h3 className="font-semibold whitespace-nowrap">{resource.title}</h3>
                  <p className="text-sm text-slate-400">- {resource.description}</p>
                </div>
              </div>
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
                  <div className="text-slate-300 prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-4">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-4">{children}</ol>,
                        li: ({ children }) => <li className="ml-2">{children}</li>,
                      }}
                    >
                      {faq.answer}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
