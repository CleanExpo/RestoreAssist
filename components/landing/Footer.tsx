"use client"

import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"

interface FooterProps {
  darkMode: boolean
}

export default function Footer({ darkMode }: FooterProps) {
  return (
    <footer className={`py-16 px-6 border-t relative transition-colors duration-300 bg-[#C4C8CA]/30 overflow-hidden ${darkMode ? 'border-[#5A6A7B]/30' : 'border-[#5A6A7B]/20'}`}>
      {/* Golden Decorative Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-1/4 w-80 h-80 bg-[#8A6B4E]/8 rounded-full blur-3xl"></div>
        <svg className="absolute top-1/4 left-1/3 w-60 h-60 opacity-10" viewBox="0 0 200 200">
          <path d="M100 30 Q140 30 170 60 Q170 100 140 130 Q100 130 60 130 Q30 100 30 60 Q30 30 60 30 Z" fill="#8A6B4E"/>
          <path d="M100 60 Q130 60 150 80 Q150 100 130 120 Q100 120 70 120 Q50 100 50 80 Q50 60 70 60 Z" fill="#8A6B4E" opacity="0.4"/>
        </svg>
        <svg className="absolute bottom-1/4 right-1/3 w-44 h-44 opacity-8" viewBox="0 0 200 200">
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
  )
}

