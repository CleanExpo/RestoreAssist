"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, Moon, Sun } from "lucide-react"

interface HeaderProps {
  darkMode: boolean
  setDarkMode: (value: boolean) => void
}

export default function Header({ darkMode, setDarkMode }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
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
              priority
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
  )
}

