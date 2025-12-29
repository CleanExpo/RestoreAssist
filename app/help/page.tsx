"use client"

import { useState, useEffect } from "react"
import { ChevronDown, Mail, MessageSquare, BookOpen, Video } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function HelpPage() {
  const [darkMode, setDarkMode] = useState(true)
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  useEffect(() => {
    if (!document.getElementById('google-fonts-preconnect')) {
      const link1 = document.createElement('link')
      link1.id = 'google-fonts-preconnect'
      link1.rel = 'preconnect'
      link1.href = 'https://fonts.googleapis.com'
      document.head.appendChild(link1)

      const link2 = document.createElement('link')
      link2.rel = 'preconnect'
      link2.href = 'https://fonts.gstatic.com'
      link2.crossOrigin = 'anonymous'
      document.head.appendChild(link2)

      const link3 = document.createElement('link')
      link3.href = 'https://fonts.googleapis.com/css2?family=Open+Sauce+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap'
      link3.rel = 'stylesheet'
      document.head.appendChild(link3)
    }
  }, [])

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
      question: "Can I customise cost libraries?",
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
      description: "airestoreassist@gmail.com",
      response: "24-48 hours",
    },
    {
      icon: MessageSquare,
      title: "Live Chat (Coming Soon)",
      description: "Available in app",
      response: "9am-5pm AEST",
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
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />
      
      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Help & Support
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Find answers and get support for Restore Assist
          </motion.p>
      </div>
      </section>

      {/* Support Channels */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-8 mb-12">
        {supportChannels.map((channel, i) => {
          const Icon = channel.icon
          return (
                <motion.div
              key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className={`p-8 rounded-lg border backdrop-blur-sm transition-all ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 hover:bg-[#1C2E47]/70' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 hover:bg-[#F4F5F6]/70'}`}
            >
                  <Icon size={28} className={`mb-4 ${darkMode ? 'text-[#8A6B4E]' : 'text-[#8A6B4E]'}`} />
                  <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {channel.title}
                  </h3>
                  <p className={`text-base mb-3 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {channel.description}
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-[#5A6A7B]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Response: {channel.response}
                  </p>
                </motion.div>
          )
        })}
      </div>

      {/* Resources */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
        {resources.map((resource, i) => {
          const Icon = resource.icon
          return (
                <motion.button
              key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: (i + 2) * 0.1 }}
                  className={`p-8 rounded-lg border backdrop-blur-sm transition-all text-left group ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 hover:bg-[#1C2E47]/70' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 hover:bg-[#F4F5F6]/70'}`}
            >
                  <Icon size={28} className={`mb-4 group-hover:scale-110 transition-transform ${darkMode ? 'text-[#8A6B4E]' : 'text-[#8A6B4E]'}`} />
                  <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {resource.title}
                  </h3>
                  <p className={`text-base ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {resource.description}
                  </p>
                </motion.button>
          )
        })}
      </div>

      {/* FAQs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className={`p-8 rounded-lg border backdrop-blur-sm ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20'}`}
          >
            <h2 className={`text-3xl font-bold mb-8 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
          {faqs.map((faq) => (
                <div
                  key={faq.id}
                  className={`rounded-lg overflow-hidden border ${darkMode ? 'border-[#5A6A7B]/30 bg-[#1C2E47]/30' : 'border-[#5A6A7B]/20 bg-[#F4F5F6]/30'}`}
                >
              <button
                onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    className={`w-full p-6 flex items-center justify-between transition-colors text-left ${darkMode ? 'hover:bg-[#1C2E47]/70' : 'hover:bg-[#F4F5F6]/70'}`}
              >
                    <span className={`font-semibold text-lg ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      {faq.question}
                    </span>
                <ChevronDown
                  size={20}
                      className={`transition-transform ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'} ${expandedFaq === faq.id ? "rotate-180" : ""}`}
                />
              </button>
                  <AnimatePresence>
              {expandedFaq === faq.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className={`p-6 border-t ${darkMode ? 'border-[#5A6A7B]/30 bg-[#1C2E47]/20 text-[#C4C8CA]' : 'border-[#5A6A7B]/20 bg-[#F4F5F6]/20 text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
