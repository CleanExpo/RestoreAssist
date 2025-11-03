"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, Moon, Sun } from "lucide-react"
import MobileWorkflowCarousel from "@/components/landing/MobileWorkflowCarousel"

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)

  useEffect(() => {
    // Load fonts dynamically if not already loaded
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
      
      // Note: Canva Sans is proprietary and not available on Google Fonts
      // Using Inter as a fallback which has similar characteristics
    }
  }, [])

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}>
      {/* Header */}
        <header className={`fixed top-0 w-full z-50 backdrop-blur-sm border-b transition-colors duration-300 ${darkMode ? 'bg-[#1C2E47]/95 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/95 border-[#5A6A7B]/20'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/">
              <Image 
                src="/logo.png" 
                alt="Restore Assist Logo" 
                width={64} 
                height={64} 
                className="object-contain"
              />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/features" className={`transition-colors font-medium text-sm ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              FEATURES
            </Link>
            <Link href="/solutions" className={`transition-colors font-medium text-sm ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              SOLUTIONS
            </Link>
            <Link href="/pricing" className={`transition-colors font-medium text-sm ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              PRICING
            </Link>
            <Link href="/resources" className={`transition-colors font-medium text-sm ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              RESOURCES
            </Link>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/signup"
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${darkMode ? 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/80' : 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/90'}`}
              style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              FREE TRIAL
            </Link>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${darkMode ? 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/80' : 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/90'}`}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link
              href="/login"
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${darkMode ? 'bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/80' : 'bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/90'}`}
              style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              LOG IN
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className={`md:hidden transition-colors ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`md:hidden border-t overflow-hidden transition-colors ${darkMode ? 'bg-[#1C2E47] border-[#5A6A7B]/30' : 'bg-[#F4F5F6] border-[#5A6A7B]/20'}`}
            >
              <div className="p-4 space-y-4">
                <Link href="/features" className={`block transition-colors ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>FEATURES</Link>
                <Link href="/solutions" className={`block transition-colors ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>SOLUTIONS</Link>
                <Link href="/pricing" className={`block transition-colors ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>PRICING</Link>
                <Link href="/resources" className={`block transition-colors ${darkMode ? 'text-[#C4C8CA] hover:text-[#F4F5F6]' : 'text-[#5A6A7B] hover:text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>RESOURCES</Link>
                <Link href="/signup" className={`block w-full px-4 py-2 rounded-lg text-center transition-colors ${darkMode ? 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/80' : 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/90'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>FREE TRIAL</Link>
                <Link href="/login" className={`block w-full px-4 py-2 rounded-lg text-center transition-colors ${darkMode ? 'bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/80' : 'bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/90'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  LOG IN
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className={`pt-48 pb-20 px-6 relative z-10 min-h-[80vh] flex items-center overflow-hidden ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}>
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-[500px] h-[500px] bg-[#8A6B4E]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-[600px] h-[600px] bg-[#8A6B4E]/18 rounded-full blur-3xl"></div>
          <div className={`absolute inset-0 ${darkMode ? 'bg-[#C4C8CA]/20' : 'bg-[#C4C8CA]/30'}`}></div>
          <svg className="absolute top-1/2 left-1/4 w-96 h-96 opacity-20" viewBox="0 0 200 200">
            <path d="M100 20 L120 80 L180 80 L135 115 L155 175 L100 140 L45 175 L65 115 L20 80 L80 80 Z" fill="#8A6B4E"/>
          </svg>
          <svg className="absolute bottom-1/4 right-1/3 w-80 h-80 opacity-15" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" fill="none" stroke="#8A6B4E" strokeWidth="3"/>
            <circle cx="100" cy="100" r="50" fill="none" stroke="#8A6B4E" strokeWidth="2"/>
            <circle cx="100" cy="100" r="20" fill="#8A6B4E"/>
          </svg>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-6xl md:text-7xl font-bold mb-6 leading-tight ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Restore
            <br />
            Assist
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl italic font-light ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Consistent Repeatable Process Management
          </motion.p>
        </div>
      </section>

      {/* Section - Inspection. Scoping. Estimating. Connected. */}
      <section className={`py-20 px-6 relative transition-colors duration-300 bg-[#C4C8CA]/30 overflow-hidden`}>
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-[#8A6B4E]/22 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-[450px] h-[450px] bg-[#8A6B4E]/20 rounded-full blur-3xl"></div>
          <svg className="absolute top-1/3 right-1/4 w-96 h-96 opacity-20" viewBox="0 0 200 200">
            <polygon points="100,20 180,60 160,140 40,140 20,60" fill="#8A6B4E"/>
            <polygon points="100,50 150,75 135,125 65,125 50,75" fill="#8A6B4E" opacity="0.5"/>
          </svg>
          <svg className="absolute bottom-1/3 left-1/3 w-80 h-80 opacity-15" viewBox="0 0 200 200">
            <rect x="50" y="50" width="100" height="100" rx="20" fill="none" stroke="#8A6B4E" strokeWidth="3"/>
            <rect x="70" y="70" width="60" height="60" rx="10" fill="#8A6B4E" opacity="0.3"/>
          </svg>
            </div>
        <div className="max-w-7xl mx-auto relative z-10">
         
          
          {/* Mobile Carousel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center"
          >
              <MobileWorkflowCarousel darkMode={darkMode} />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-16 px-6 border-t relative transition-colors duration-300 bg-[#C4C8CA]/30 overflow-hidden ${darkMode ? 'border-[#5A6A7B]/30' : 'border-[#5A6A7B]/20'}`}>
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-1/4 w-[550px] h-[550px] bg-[#8A6B4E]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-1/4 w-[500px] h-[500px] bg-[#8A6B4E]/18 rounded-full blur-3xl"></div>
          <svg className="absolute top-1/4 left-1/3 w-96 h-96 opacity-20" viewBox="0 0 200 200">
            <path d="M100 30 Q140 30 170 60 Q170 100 140 130 Q100 130 60 130 Q30 100 30 60 Q30 30 60 30 Z" fill="#8A6B4E"/>
            <path d="M100 60 Q130 60 150 80 Q150 100 130 120 Q100 120 70 120 Q50 100 50 80 Q50 60 70 60 Z" fill="#8A6B4E" opacity="0.4"/>
          </svg>
          <svg className="absolute bottom-1/4 right-1/3 w-80 h-80 opacity-15" viewBox="0 0 200 200">
            <ellipse cx="100" cy="100" rx="70" ry="50" fill="none" stroke="#8A6B4E" strokeWidth="3"/>
            <ellipse cx="100" cy="100" rx="40" ry="30" fill="#8A6B4E" opacity="0.3"/>
          </svg>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className={`text-4xl md:text-5xl font-bold mb-6 text-center ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Inspection. Scoping. Estimating. Connected.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={`text-lg md:text-xl max-w-4xl mx-auto leading-relaxed text-center mb-20 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            RestoreAssist turns verified site data into accurate, transparent, and auditable restoration reports — saving time, ensuring compliance, and building trust through evidence-based intelligence.
          </motion.p>
          <div className="grid md:grid-cols-5 gap-12">
            {/* Left Side - Brand Information */}
            <div className="md:col-span-2">
              <div className="flex items-start gap-4 mb-6">
                <Link href="/" className="shrink-0">
                  <Image 
                    src="/logo.png" 
                    alt="Restore Assist Logo" 
                    width={96} 
                    height={96} 
                    className="object-contain"
                  />
                </Link>
                <div>
                  <h3 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Restore Assist
                  </h3>
                  <p className={`text-sm mb-4 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    AI-powered damage assessment platform for Australian restoration professionals.
                  </p>
                  <div className={`text-xs space-y-1 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    <p>Restore Assist by Unite-Group Nexus Pty Ltd</p>
                    <p>ABN: [Company ABN]</p>
                    <p>Address: [Company Address]</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Navigation Columns */}
            <div className="md:col-span-3 grid md:grid-cols-3 gap-8">
              {/* PRODUCT */}
              <div>
                <h4 className={`font-bold mb-4 text-sm ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  PRODUCT
                </h4>
                <ul className={`space-y-2 text-sm ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <li><Link href="/features" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Features</Link></li>
                  <li><Link href="/pricing" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Pricing</Link></li>
                  <li><Link href="/dashboard/analytics" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Analytics</Link></li>
                </ul>
              </div>

              {/* RESOURCES */}
              <div>
                <h4 className={`font-bold mb-4 text-sm ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  RESOURCES
                </h4>
                <ul className={`space-y-2 text-sm ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <li><Link href="/help" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Help Centre</Link></li>
                  <li><Link href="/compliance-library" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Compliance Library</Link></li>
                  <li><Link href="/blog" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Blog</Link></li>
                </ul>
              </div>

              {/* COMPANY */}
              <div>
                <h4 className={`font-bold mb-4 text-sm ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  COMPANY
                </h4>
                <ul className={`space-y-2 text-sm ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <li><Link href="/about" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>About</Link></li>
                  <li><Link href="/how-it-works" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>How it Works</Link></li>
                  <li><Link href="/compliance" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Compliance</Link></li>
                  <li><Link href="/contact" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>Contact</Link></li>
                  <li><Link href="/faq" className={`transition-colors ${darkMode ? 'hover:text-[#F4F5F6]' : 'hover:text-[#1C2E47]'}`}>FAQ</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

