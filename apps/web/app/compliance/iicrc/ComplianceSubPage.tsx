"use client"

import { useState } from "react"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { motion } from "framer-motion"

const standards = [
  {
    name: "IICRC S500",
    description: "Standard for Professional Water Damage Restoration",
    details:
      "RestoreAssist enforces IICRC S500 protocols for water damage classification, category assignment, and drying goals throughout every assessment.",
  },
  {
    name: "IICRC S520",
    description: "Standard for Professional Mould Remediation",
    details:
      "Our platform guides assessors through S520-compliant mould inspection and remediation workflows, including containment and clearance criteria.",
  },
  {
    name: "IICRC S540",
    description: "Standard for Trauma and Crime Scene Cleanup",
    details:
      "For biohazard events, RestoreAssist includes S540 safety checklists and documentation requirements.",
  },
]

export default function ComplianceSubPage() {
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"}`}
    >
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
            style={{
              fontFamily:
                '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            IICRC Compliance
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
            style={{
              fontFamily:
                '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Built-in adherence to IICRC standards across every restoration
            assessment.
          </motion.p>
        </div>
      </section>

      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {standards.map((standard, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-8 rounded-lg ${darkMode ? "bg-[#1C2E47]/50" : "bg-[#F4F5F6]/50"} backdrop-blur-sm border ${darkMode ? "border-[#5A6A7B]/30" : "border-[#5A6A7B]/20"}`}
              >
                <h3
                  className={`text-2xl font-bold mb-3 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {standard.name}
                </h3>
                <p
                  className="text-base font-medium mb-4 text-[#8A6B4E]"
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {standard.description}
                </p>
                <p
                  className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {standard.details}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
