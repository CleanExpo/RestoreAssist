"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X } from "lucide-react"
import Footer from "@/components/landing/Footer"

export default function FeaturesPage() {
  const [darkMode, setDarkMode] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const features = [
    {
      title: "AI-Powered Damage Assessment",
      description: "Advanced AI technology analyzes damage patterns and provides accurate assessments in real-time.",
      icon: "🔍"
    },
    {
      title: "IICRC S500 Compliance",
      description: "Fully compliant with IICRC S500 standards for water damage restoration and assessment.",
      icon: "✅"
    },
    {
      title: "Multi-Hazard Support",
      description: "Comprehensive support for water, fire, mold, and storm damage assessments.",
      icon: "🌊"
    },
    {
      title: "Photo & Data Capture",
      description: "Seamless integration for capturing photos and essential data during inspections.",
      icon: "📸"
    },
    {
      title: "Dynamic Workflow Engine",
      description: "Flexible workflow system that adapts to your specific restoration process.",
      icon: "⚙️"
    },
    {
      title: "Real-Time Cost Calculation",
      description: "Instant cost calculations with regional pricing libraries and equipment rates.",
      icon: "💰"
    }
  ]

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}>
      {/* Header - Hamburger menu always visible, even on desktop */}
      <header className="fixed top-0 w-full z-[100] bg-[#1C2E47]/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
          {/* Logo - Left Side */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              {/* White circular logo */}
              <div className=" flex items-center justify-center relative overflow-hidden">
                <Image 
                  src="/logo.png" 
                  alt="Restore Assist Logo" 
                  width={100} 
                  height={100} 
                  className="object-contain p-1 md:p-2"
                />
              </div>
            </Link>
          </div>

          {/* Hamburger Menu - Right Side, Bigger Size, Always Visible */}
          <button
            className="text-white hover:text-gray-300 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X size={32} className="w-8 h-8" />
            ) : (
              <Menu size={32} className="w-8 h-8" />
            )}
          </button>
        </div>
      </header>

      {/* Overlay when menu is open - Behind menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Sidebar Menu - Slides in from right */}
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ 
                duration: 0.35, 
                ease: [0.32, 0.72, 0, 1],
                opacity: { duration: 0.2 }
              }}
              className="fixed top-0 right-0 h-screen w-80 max-w-[85vw] bg-[#1C2E47] border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[160] overflow-hidden flex flex-col"
            >
              {/* Menu Header - Fixed at top */}
              <div className="flex-shrink-0 bg-[#1C2E47] border-b border-white/10 px-6 py-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white uppercase tracking-wider">Menu</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-white hover:text-gray-300 transition-colors p-2 -mr-2 rounded-lg hover:bg-white/10"
                  aria-label="Close menu"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Menu Content - Scrollable */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                  <nav className="space-y-1">
                    <Link 
                      href="/features" 
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Features
                    </Link>
                    <Link 
                      href="/solutions" 
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Solutions
                    </Link>
                    <Link 
                      href="/pricing" 
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Pricing
                    </Link>
                    <Link 
                      href="/resources" 
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Resources
                    </Link>
                  </nav>

                  {/* Action Buttons */}
                  <div className="pt-6 mt-6 border-t border-white/10 space-y-3">
                    <Link
                      href="/pricing"
                      className="block w-full px-6 py-3 bg-[#5A6A7B] text-white rounded-lg text-center font-medium hover:bg-[#5A6A7B]/80 transition-all duration-200 shadow-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Pricing
                    </Link>
                    <Link
                      href="/login"
                      className="block w-full px-6 py-3 bg-[#8A6B4E] text-white rounded-lg text-center font-medium hover:bg-[#8A6B4E]/80 transition-all duration-200 shadow-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log In
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
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
            Features
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Powerful tools designed to streamline your restoration workflow.
          </motion.p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? 'bg-[#1C2E47]/50' : 'bg-[#F4F5F6]/50'} backdrop-blur-sm border ${darkMode ? 'border-[#5A6A7B]/30' : 'border-[#5A6A7B]/20'}`}
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className={`text-2xl font-bold mb-3 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {feature.title}
                </h3>
                <p className={`text-base ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {feature.description}
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

