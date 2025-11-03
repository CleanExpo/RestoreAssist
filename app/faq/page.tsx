"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function FAQPage() {
  const [darkMode, setDarkMode] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(0)

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
      question: "What is RestoreAssist?",
      answer: "RestoreAssist is an AI-powered damage assessment platform designed for Australian restoration professionals. It helps you create accurate, transparent, and auditable restoration reports with compliance built-in."
    },
    {
      question: "How does the AI assessment work?",
      answer: "Our AI analyzes captured site data including photos, measurements, and damage details to identify damage patterns, compliance requirements, and generate detailed scope of work documents automatically."
    },
    {
      question: "What compliance standards does RestoreAssist support?",
      answer: "RestoreAssist supports IICRC S500, NCC 2022, AS/NZS standards, and meets requirements of major Australian insurance providers. All assessments are automatically checked for compliance."
    },
    {
      question: "Can I export reports?",
      answer: "Yes, you can export reports in both PDF and Excel formats. Reports are formatted to meet insurance industry requirements and are ready for submission."
    },
    {
      question: "Is there a free trial?",
      answer: "Yes, all plans include a 14-day free trial. You can explore all features without any commitment during this period."
    },
    {
      question: "What happens after my free trial ends?",
      answer: "After your free trial ends, you'll need to select a paid plan to continue using RestoreAssist. Your data will be preserved and you can continue from where you left off."
    },
    {
      question: "Do you offer training and support?",
      answer: "Yes, we offer comprehensive training and onboarding for Enterprise customers. All plans include email support, with priority support available for Professional and Enterprise plans."
    },
    {
      question: "Can I integrate RestoreAssist with other systems?",
      answer: "Enterprise plans include custom integrations. Our API documentation is available for developers to integrate RestoreAssist with existing systems and workflows."
    }
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
            Frequently Asked Questions
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Find answers to common questions about RestoreAssist.
          </motion.p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.05 }}
                className={`rounded-lg border ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20'} backdrop-blur-sm overflow-hidden`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className={`w-full p-6 flex items-center justify-between text-left ${darkMode ? 'hover:bg-[#1C2E47]/70' : 'hover:bg-[#F4F5F6]/70'} transition-colors`}
                >
                  <h3 className={`text-lg font-semibold pr-4 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {faq.question}
                  </h3>
                  <ChevronDown
                    size={20}
                    className={`${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'} transition-transform flex-shrink-0 ${openIndex === index ? 'rotate-180' : ''}`}
                  />
                </button>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className={`p-6 pt-0 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}

