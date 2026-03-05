"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { BookOpen, ArrowRight, Droplets } from "lucide-react"

const fontHeading = '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const fontBody = '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

const guides = [
  {
    title: "The Complete Guide to AS-IICRC S500:2025",
    description:
      "Water damage categories, drying classes, psychrometric principles, documentation requirements, and IICRC certification — everything Australian contractors need to know about the S500:2025 standard.",
    href: "/guides/iicrc-s500-2025",
    category: "Compliance",
    readTime: "15 min read",
    icon: Droplets,
  },
]

export default function GuidesIndexClient() {
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero */}
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
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${
              darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
            }`}
            style={{ fontFamily: fontHeading }}
          >
            Industry Guides
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
            style={{ fontFamily: fontBody }}
          >
            Authoritative guides on restoration standards, compliance, and best practices for Australian contractors.
          </motion.p>
        </div>
      </section>

      {/* Guides Grid */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {guides.map((guide, index) => (
              <motion.div
                key={guide.href}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Link
                  href={guide.href}
                  className={`block p-6 rounded-lg border h-full ${
                    darkMode
                      ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30"
                      : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"
                  } backdrop-blur-sm hover:border-[#8A6B4E] transition-colors group`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                      <guide.icon className="size-5 text-[#8A6B4E]" />
                    </div>
                    <span
                      className={`text-xs px-3 py-1 rounded-full ${
                        darkMode ? "bg-[#8A6B4E]/20 text-[#8A6B4E]" : "bg-[#8A6B4E]/10 text-[#8A6B4E]"
                      }`}
                      style={{ fontFamily: fontBody }}
                    >
                      {guide.category}
                    </span>
                    <span
                      className={`text-xs ${darkMode ? "text-[#5A6A7B]" : "text-[#5A6A7B]"}`}
                      style={{ fontFamily: fontBody }}
                    >
                      {guide.readTime}
                    </span>
                  </div>
                  <h3
                    className={`text-xl font-bold mb-3 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: fontHeading }}
                  >
                    {guide.title}
                  </h3>
                  <p
                    className={`text-sm mb-4 leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                    style={{ fontFamily: fontBody }}
                  >
                    {guide.description}
                  </p>
                  <span
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#8A6B4E] group-hover:gap-2 transition-all"
                    style={{ fontFamily: fontBody }}
                  >
                    Read Guide <ArrowRight className="size-4" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
