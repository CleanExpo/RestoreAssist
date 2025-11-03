"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function ResourcesPage() {
  const [darkMode, setDarkMode] = useState(true)

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

  const resources = [
    {
      category: "Documentation",
      items: [
        { title: "Getting Started Guide", description: "Learn the basics of using RestoreAssist", link: "/help" },
        { title: "API Documentation", description: "Integrate RestoreAssist with your systems", link: "#" },
        { title: "Compliance Library", description: "Access compliance standards and guidelines", link: "#" }
      ]
    },
    {
      category: "Support",
      items: [
        { title: "Help Centre", description: "Find answers to common questions", link: "/help" },
        { title: "Contact Support", description: "Get help from our support team", link: "#" },
        { title: "Video Tutorials", description: "Watch step-by-step video guides", link: "#" }
      ]
    },
    {
      category: "Community",
      items: [
        { title: "Blog", description: "Read the latest updates and insights", link: "#" },
        { title: "Case Studies", description: "See how others use RestoreAssist", link: "#" },
        { title: "Webinars", description: "Join live training sessions", link: "#" }
      ]
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
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Resources
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Everything you need to get the most out of RestoreAssist.
          </motion.p>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-3 gap-8">
            {resources.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? 'bg-[#1C2E47]/50' : 'bg-[#F4F5F6]/50'} backdrop-blur-sm border ${darkMode ? 'border-[#5A6A7B]/30' : 'border-[#5A6A7B]/20'}`}
              >
                <h3 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {category.category}
                </h3>
                <div className="space-y-4">
                  {category.items.map((item, idx) => (
                    <Link
                      key={idx}
                      href={item.link}
                      className={`block p-4 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#1C2E47]/70' : 'hover:bg-[#F4F5F6]/70'}`}
                    >
                      <h4 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {item.title}
                      </h4>
                      <p className={`text-sm ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {item.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}

