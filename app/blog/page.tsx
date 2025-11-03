"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function BlogPage() {
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

  const blogPosts = [
    {
      title: "The Future of AI in Restoration Assessment",
      excerpt: "Exploring how AI technology is revolutionizing damage assessment and making restoration work more efficient and accurate.",
      date: "January 15, 2024",
      category: "Technology",
      readTime: "5 min read"
    },
    {
      title: "Understanding IICRC S500 Compliance",
      excerpt: "A comprehensive guide to IICRC S500 standards and how RestoreAssist helps you maintain compliance automatically.",
      date: "January 8, 2024",
      category: "Compliance",
      readTime: "7 min read"
    },
    {
      title: "Best Practices for Water Damage Assessment",
      excerpt: "Learn the essential steps and best practices for conducting thorough water damage assessments on-site.",
      date: "January 1, 2024",
      category: "Best Practices",
      readTime: "6 min read"
    },
    {
      title: "Streamlining Your Restoration Workflow",
      excerpt: "Discover how modern technology can help you reduce report generation time while improving accuracy and compliance.",
      date: "December 24, 2023",
      category: "Workflow",
      readTime: "4 min read"
    },
    {
      title: "Regional Pricing in Australian Restoration",
      excerpt: "Understanding how regional cost variations affect restoration estimates and how to account for them.",
      date: "December 18, 2023",
      category: "Pricing",
      readTime: "5 min read"
    },
    {
      title: "Building Trust with Transparent Reports",
      excerpt: "How transparent, evidence-based reporting builds trust with clients and insurance providers.",
      date: "December 10, 2023",
      category: "Industry",
      readTime: "6 min read"
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
            Blog
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Insights, tips, and updates from the restoration industry.
          </motion.p>
        </div>
      </section>

      {/* Blog Posts */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-6 rounded-lg border ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20'} backdrop-blur-sm hover:border-[#8A6B4E] transition-colors`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs px-3 py-1 rounded-full ${darkMode ? 'bg-[#8A6B4E]/20 text-[#8A6B4E]' : 'bg-[#8A6B4E]/10 text-[#8A6B4E]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {post.category}
                  </span>
                  <span className={`text-xs ${darkMode ? 'text-[#5A6A7B]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {post.readTime}
                  </span>
                </div>
                <h3 className={`text-xl font-bold mb-3 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {post.title}
                </h3>
                <p className={`text-sm mb-4 leading-relaxed ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${darkMode ? 'text-[#5A6A7B]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {post.date}
                  </span>
                  <Link
                    href="#"
                    className={`text-sm font-medium ${darkMode ? 'text-[#8A6B4E] hover:text-[#8A6B4E]/80' : 'text-[#8A6B4E] hover:text-[#8A6B4E]/90'} transition-colors`}
                    style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                  >
                    Read More →
                  </Link>
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

