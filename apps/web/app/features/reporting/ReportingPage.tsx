"use client"

import { useState } from "react"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { motion } from "framer-motion"

const capabilities = [
  {
    title: "Photo Evidence Integration",
    description:
      "Attach geotagged photos directly to report sections with automatic timestamps and annotations for full evidentiary support.",
  },
  {
    title: "Moisture & Environmental Readings",
    description:
      "Log moisture, humidity, and temperature readings in structured tables that meet IICRC documentation requirements.",
  },
  {
    title: "One-Click PDF & Sharing",
    description:
      "Export complete reports as branded PDFs or share secure links with insurers, adjusters, and clients instantly.",
  },
]

export default function ReportingPage() {
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
            Reporting
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
            Comprehensive restoration reports built for insurers, adjusters, and
            property owners.
          </motion.p>
        </div>
      </section>

      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {capabilities.map((item, index) => (
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
                  {item.title}
                </h3>
                <p
                  className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {item.description}
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
