"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function ContactPage() {
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
        <div className="max-w-7xl mx-auto w-full relative z-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Contact Us
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Get in touch with our team. We're here to help.
          </motion.p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-12 mb-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                Get in Touch
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Email
                  </h3>
                  <p className={`${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    support@restoreassist.com.au
                  </p>
                </div>
                <div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Phone
                  </h3>
                  <p className={`${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    1300 RESTORE (1300 737 867)
                  </p>
                </div>
                <div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Office Hours
                  </h3>
                  <p className={`${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Monday - Friday: 9:00 AM - 5:00 PM AEST
                  </p>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                Send a Message
              </h2>
              <form className="space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Your Name"
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 text-[#F4F5F6] placeholder-[#5A6A7B]' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 text-[#1C2E47] placeholder-[#5A6A7B]'} focus:outline-none focus:border-[#8A6B4E] transition-colors`}
                    style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                  />
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="Your Email"
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 text-[#F4F5F6] placeholder-[#5A6A7B]' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 text-[#1C2E47] placeholder-[#5A6A7B]'} focus:outline-none focus:border-[#8A6B4E] transition-colors`}
                    style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                  />
                </div>
                <div>
                  <textarea
                    placeholder="Your Message"
                    rows={5}
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 text-[#F4F5F6] placeholder-[#5A6A7B]' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 text-[#1C2E47] placeholder-[#5A6A7B]'} focus:outline-none focus:border-[#8A6B4E] transition-colors resize-none`}
                    style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                  />
                </div>
                <button
                  type="submit"
                  className={`w-full px-6 py-3 rounded-lg font-medium transition-colors bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/90`}
                  style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                  Send Message
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}

