"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, Moon, Sun } from "lucide-react"
import MobileWorkflowCarousel from "@/components/landing/MobileWorkflowCarousel"

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-[#1a2332]' : 'bg-white'} text-slate-50 transition-colors`}>
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#1a2332]/95 backdrop-blur-sm border-b border-slate-700/30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex flex-col items-center justify-center p-1">
              <div className="text-[8px] font-semibold text-slate-900 leading-none">RestoreAssist</div>
              <div className="w-4 h-4 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-900">
                  <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-[6px] font-bold text-slate-900 leading-none">RESTORATION</div>
              <div className="text-[6px] font-bold text-slate-900 leading-none">INTELLIGENCE</div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-300 hover:text-white transition-colors font-medium text-sm">
              FEATURES
            </a>
            <a href="#solutions" className="text-slate-300 hover:text-white transition-colors font-medium text-sm">
              SOLUTIONS
            </a>
            <a href="#pricing" className="text-slate-300 hover:text-white transition-colors font-medium text-sm">
              PRICING
            </a>
            <a href="#resources" className="text-slate-300 hover:text-white transition-colors font-medium text-sm">
              RESOURCES
            </a>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <button className="px-4 py-2 bg-[#2d3748] text-white rounded-lg font-medium text-sm hover:bg-[#374151] transition-colors">
              FREE TRIAL
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="px-4 py-2 bg-[#2d3748] text-white rounded-lg font-medium text-sm hover:bg-[#374151] transition-colors"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#c05621] text-white rounded-lg font-medium text-sm hover:bg-[#d4692e] transition-colors"
            >
              LOG IN
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden"
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
              className="md:hidden bg-[#1a2332] border-t border-slate-700/30 overflow-hidden"
            >
              <div className="p-4 space-y-4">
                <a href="#features" className="block text-slate-300 hover:text-white">FEATURES</a>
                <a href="#solutions" className="block text-slate-300 hover:text-white">SOLUTIONS</a>
                <a href="#pricing" className="block text-slate-300 hover:text-white">PRICING</a>
                <a href="#resources" className="block text-slate-300 hover:text-white">RESOURCES</a>
                <button className="w-full px-4 py-2 bg-[#2d3748] text-white rounded-lg">FREE TRIAL</button>
                <Link href="/login" className="block w-full px-4 py-2 bg-[#c05621] text-white rounded-lg text-center">
                  LOG IN
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative min-h-screen flex items-center">
        {/* Background Texture */}
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 opacity-30">
          <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iYSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiPjxjaXJjbGUgY3g9IjEwIiBjeT0iMTAiIHI9IjEiIGZpbGw9IiM5ODg1NzAiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=')] opacity-20"></div>
        </div>

        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            {/* Left Side - Text Content */}
            <div className="flex-1">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-6xl md:text-7xl font-bold mb-6 text-white leading-tight"
                style={{ fontFamily: 'sans-serif' }}
              >
                Restore
                <br />
                Assist
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-xl md:text-2xl text-white italic font-light"
                style={{ fontFamily: 'sans-serif' }}
              >
                Consistent Repeatable Process Management
              </motion.p>
            </div>

            {/* Right Side - Mobile Carousel */}
            <div className="flex-1">
              <MobileWorkflowCarousel />
            </div>
          </div>
        </div>
      </section>
    {/* Section - Inspection. Scoping. Estimating. Connected. */}
    <section className={`py-20 px-6 relative transition-colors duration-300 bg-[#C4C8CA]/30 overflow-hidden`}>
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
          <svg className="absolute top-1/3 right-1/4 w-56 h-56 opacity-10" viewBox="0 0 200 200">
            <polygon points="100,20 180,60 160,140 40,140 20,60" fill="#8A6B4E"/>
            <polygon points="100,50 150,75 135,125 65,125 50,75" fill="#8A6B4E" opacity="0.5"/>
          </svg>
          <svg className="absolute bottom-1/3 left-1/3 w-40 h-40 opacity-8" viewBox="0 0 200 200">
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
      {/* Top Section - Inspection. Scoping. Estimating. Connected. */}
      <section className="py-20 px-6 bg-[#1a2332]">
        <div className="max-w-7xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-bold mb-6 text-[#2d3748]"
            style={{ fontFamily: 'sans-serif' }}
          >
            Inspection. Scoping. Estimating. Connected.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg md:text-xl text-slate-300 max-w-4xl mx-auto leading-relaxed"
            style={{ fontFamily: 'sans-serif' }}
          >
            RestoreAssist turns verified site data into accurate, transparent, and auditable restoration reports — saving time, ensuring compliance, and building trust through evidence-based intelligence.
          </motion.p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-[#1a2332] border-t border-slate-700/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-12">
            {/* Left Side - Brand Information */}
            <div className="md:col-span-2">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-white rounded-full flex flex-col items-center justify-center p-1.5 flex-shrink-0">
                  <div className="text-[10px] font-semibold text-slate-900 leading-none">RestoreAssist</div>
                  <div className="w-5 h-5 flex items-center justify-center mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-900">
                      <path d="M3 9L7 5L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="text-[7px] font-bold text-slate-900 leading-none">RESTORATION</div>
                  <div className="text-[7px] font-bold text-slate-900 leading-none">INTELLIGENCE</div>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'sans-serif' }}>
                    Restore Assist
                  </h3>
                  <p className="text-slate-300 text-sm mb-4" style={{ fontFamily: 'sans-serif' }}>
                    AI-powered damage assessment platform for Australian restoration professionals.
                  </p>
                  <div className="text-slate-400 text-xs space-y-1" style={{ fontFamily: 'sans-serif' }}>
                    <p>Built with Claude Opus 4.</p>
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
                <h4 className="font-bold text-white mb-4 text-sm" style={{ fontFamily: 'sans-serif' }}>
                  PRODUCT
                </h4>
                <ul className="space-y-2 text-slate-300 text-sm">
                  <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                  <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                  <li><a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a></li>
                  <li><a href="/dashboard/analytics" className="hover:text-white transition-colors">Analytics</a></li>
                </ul>
              </div>

              {/* RESOURCES */}
              <div>
                <h4 className="font-bold text-white mb-4 text-sm" style={{ fontFamily: 'sans-serif' }}>
                  RESOURCES
                </h4>
                <ul className="space-y-2 text-slate-300 text-sm">
                  <li><a href="/dashboard/help" className="hover:text-white transition-colors">Help Centre</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">API Connection</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Compliance Library</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                </ul>
              </div>

              {/* COMPANY */}
              <div>
                <h4 className="font-bold text-white mb-4 text-sm" style={{ fontFamily: 'sans-serif' }}>
                  COMPANY
                </h4>
                <ul className="space-y-2 text-slate-300 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">How it Works</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Compliance</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

