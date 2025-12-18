"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X } from "lucide-react"
import MobileWorkflowCarousel from "@/components/landing/MobileWorkflowCarousel"

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
      link3.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
      link3.rel = 'stylesheet'
      document.head.appendChild(link3)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#1C2E47] text-white">
      {/* Header - Hamburger menu always visible, even on desktop */}
      <header className="fixed top-0 w-full z-[100] bg-[#1C2E47]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo - Left Side */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              {/* White circular logo */}
              <div className="w-16 h-16 flex items-center justify-center relative overflow-hidden">
                <Image 
                  src="/logo.png" 
                  alt="Restore Assist Logo" 
                  width={64} 
                  height={64} 
                  className="object-contain p-1"
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

        {/* Overlay and Sidebar Menu - Outside header for proper z-index */}
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
                      href="/signup"
                      className="block w-full px-6 py-3 bg-[#5A6A7B] text-white rounded-lg text-center font-medium hover:bg-[#5A6A7B]/80 transition-all duration-200 shadow-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Free Trial
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
      <section className="relative min-h-screen flex items-center justify-start overflow-hidden pt-20">
        {/* Background - Dark theme */}
        <div className="absolute inset-0 bg-[#1C2E47]"></div>
        
        {/* Large faded orange/brown star graphic - Bottom Right, Cut Off */}
        <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] md:w-[700px] md:h-[700px] lg:w-[800px] lg:h-[800px] opacity-15 pointer-events-none">
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <path 
              d="M100 20 L120 80 L180 80 L135 115 L155 175 L100 140 L45 175 L65 115 L20 80 L80 80 Z" 
              fill="#D4A574"
              className="opacity-40"
            />
          </svg>
        </div>

        {/* Golden Gradient Background Behind Text */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[600px] h-[400px] md:w-[800px] md:h-[500px] lg:w-[1000px] lg:h-[600px] opacity-20 pointer-events-none z-0">
          <div className="w-full h-full bg-gradient-to-r from-[#8A6B4E]/30 via-[#D4A574]/20 to-transparent blur-3xl"></div>
        </div>

        {/* Content - Left Aligned */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
          {/* Main Title - "Restore Assist" */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-6xl md:text-8xl lg:text-9xl font-bold text-white mb-6 leading-tight text-left"
            style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Restore <br/> Assist
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl lg:text-3xl text-white/90 font-light italic text-left"
            style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Consistent Repeatable Process <br/> Management
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
            <MobileWorkflowCarousel darkMode={true} />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-16 px-6 border-t relative transition-colors duration-300 bg-[#C4C8CA]/30 overflow-hidden border-[#5A6A7B]/30`}>
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
            className={`text-4xl md:text-5xl font-bold mb-6 text-center text-white`}
            style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Inspection. Scoping. Estimating. Connected.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={`text-lg md:text-xl max-w-4xl mx-auto leading-relaxed text-center mb-20 text-white/90`}
            style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            RestoreAssist turns verified site data into accurate, transparent, and auditable restoration reports — saving time, ensuring compliance, and building trust through evidence-based intelligence.
          </motion.p>
          <div className="grid md:grid-cols-5 gap-12">
            {/* Left Side - Brand Information */}
            <div className="md:col-span-2">
              <div className="flex items-start gap-4 mb-6">
                <Link href="/" className="shrink-0">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center relative overflow-hidden">
                    <Image 
                      src="/logo.png" 
                      alt="Restore Assist Logo" 
                      width={80} 
                      height={80} 
                      className="object-contain p-2"
                    />
                  </div>
                </Link>
                <div>
                  <h3 className={`text-3xl font-bold mb-2 text-white`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Restore Assist
                  </h3>
                  <p className={`text-sm mb-4 text-white/80`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    AI-powered damage assessment platform for Australian restoration professionals.
                  </p>
                  <div className={`text-xs space-y-1 text-white/70`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    <p>Restore Assist by Unite-Group Nexus Pty Ltd</p>
                    <p>ABN: [Company ABN]</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Navigation Columns */}
            <div className="md:col-span-3 grid md:grid-cols-3 gap-8">
              {/* PRODUCT */}
              <div>
                <h4 className={`font-bold mb-4 text-sm text-white`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  PRODUCT
                </h4>
                <ul className={`space-y-2 text-sm text-white/80`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <li><Link href="/features" className={`transition-colors hover:text-white`}>Features</Link></li>
                  <li><Link href="/pricing" className={`transition-colors hover:text-white`}>Pricing</Link></li>
                  <li><Link href="/dashboard/analytics" className={`transition-colors hover:text-white`}>Analytics</Link></li>
                </ul>
              </div>

              {/* RESOURCES */}
              <div>
                <h4 className={`font-bold mb-4 text-sm text-white`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  RESOURCES
                </h4>
                <ul className={`space-y-2 text-sm text-white/80`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <li><Link href="/help" className={`transition-colors hover:text-white`}>Help Centre</Link></li>
                  <li><Link href="/compliance-library" className={`transition-colors hover:text-white`}>Compliance Library</Link></li>
                  <li><Link href="/blog" className={`transition-colors hover:text-white`}>Blog</Link></li>
                </ul>
              </div>

              {/* COMPANY */}
              <div>
                <h4 className={`font-bold mb-4 text-sm text-white`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  COMPANY
                </h4>
                <ul className={`space-y-2 text-sm text-white/80`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <li><Link href="/about" className={`transition-colors hover:text-white`}>About</Link></li>
                  <li><Link href="/how-it-works" className={`transition-colors hover:text-white`}>How it Works</Link></li>
                  <li><Link href="/compliance" className={`transition-colors hover:text-white`}>Compliance</Link></li>
                  <li><Link href="/contact" className={`transition-colors hover:text-white`}>Contact</Link></li>
                  <li><Link href="/faq" className={`transition-colors hover:text-white`}>FAQ</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
