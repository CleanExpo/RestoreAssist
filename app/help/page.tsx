"use client"

import { useState, useEffect } from "react"
import { ChevronDown, Mail, MessageSquare, BookOpen, Video, PlayCircle, ExternalLink } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { VIDEO_SERIES } from "@/lib/video-data"

// ─── Types for runtime embed data (loaded from /video-embeds.json) ─────────────

interface EmbedVideo {
  slug: string
  episode: number
  title: string
  description: string
  youtubeId: string
  embedUrl: string
  youtubeUrl: string
}

interface EmbedSeries {
  series: string
  playlistId: string
  playlistUrl: string
  videos: EmbedVideo[]
}

interface EmbedData {
  generatedAt: string
  totalVideos: number
  series: EmbedSeries[]
}

// ─── Video Tutorial Section ────────────────────────────────────────────────────

function VideoTutorials({ darkMode }: { darkMode: boolean }) {
  const [embedData, setEmbedData] = useState<EmbedData | null>(null)
  const [activeSeries, setActiveSeries] = useState(0)
  const [activeVideo, setActiveVideo] = useState<string | null>(null)

  // Load live embed data from public/video-embeds.json (populated after upload)
  useEffect(() => {
    fetch("/video-embeds.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EmbedData | null) => {
        if (data?.series?.length) setEmbedData(data)
      })
      .catch(() => {}) // silent — fall back to static data below
  }, [])

  // Merge live youtubeIds into static VIDEO_SERIES data
  const seriesData = VIDEO_SERIES.map((s) => {
    const live = embedData?.series.find((e) => e.series === s.name)
    return {
      ...s,
      playlistId: live?.playlistId ?? s.playlistId,
      playlistUrl: live?.playlistUrl ?? "",
      videos: s.videos.map((v) => {
        const liveV = live?.videos.find((lv) => lv.slug === v.slug)
        return { ...v, youtubeId: liveV?.youtubeId ?? v.youtubeId }
      }),
    }
  })

  const uploadedCount = seriesData.reduce(
    (acc, s) => acc + s.videos.filter((v) => v.youtubeId).length,
    0
  )

  return (
    <div>
      {/* Series tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {seriesData.map((s, i) => (
          <button
            key={s.name}
            onClick={() => { setActiveSeries(i); setActiveVideo(null) }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeSeries === i
                ? "bg-[#8A6B4E] text-white"
                : darkMode
                ? "bg-[#1C2E47]/60 text-[#C4C8CA] hover:bg-[#1C2E47] border border-[#5A6A7B]/30"
                : "bg-[#F4F5F6]/60 text-[#5A6A7B] hover:bg-[#F4F5F6] border border-[#5A6A7B]/20"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Series description + playlist link */}
      {seriesData[activeSeries] && (
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <p className={`text-sm ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}>
            {seriesData[activeSeries].description}
          </p>
          {seriesData[activeSeries].playlistUrl && (
            <a
              href={seriesData[activeSeries].playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-[#8A6B4E] hover:underline"
            >
              <ExternalLink size={14} />
              View playlist on YouTube
            </a>
          )}
        </div>
      )}

      {/* Video grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {seriesData[activeSeries]?.videos.map((v) => (
          <motion.div
            key={v.slug}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`rounded-lg border overflow-hidden ${
              darkMode
                ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30"
                : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"
            }`}
          >
            {/* Embed or thumbnail */}
            {v.youtubeId ? (
              activeVideo === v.slug ? (
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${v.youtubeId}?autoplay=1&rel=0`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setActiveVideo(v.slug)}
                  className="relative w-full aspect-video bg-black overflow-hidden group"
                  aria-label={`Play ${v.title}`}
                >
                  <img
                    src={`https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg`}
                    alt={v.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <PlayCircle
                      size={52}
                      className="text-white drop-shadow-lg group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                    Ep {v.episode}
                  </div>
                </button>
              )
            ) : (
              <div className="aspect-video bg-[#1C2E47]/40 flex flex-col items-center justify-center gap-2">
                <Video
                  size={36}
                  className={darkMode ? "text-[#5A6A7B]" : "text-[#C4C8CA]"}
                />
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full ${
                    darkMode
                      ? "bg-[#5A6A7B]/30 text-[#C4C8CA]"
                      : "bg-[#5A6A7B]/10 text-[#5A6A7B]"
                  }`}
                >
                  Coming Soon
                </span>
              </div>
            )}

            {/* Video info */}
            <div className="p-4">
              <p
                className={`text-xs font-medium mb-1 ${
                  darkMode ? "text-[#8A6B4E]" : "text-[#8A6B4E]"
                }`}
              >
                Episode {v.episode}
              </p>
              <h3
                className={`text-sm font-semibold leading-snug mb-1 ${
                  darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
                }`}
                style={{ fontFamily: '"Open Sauce Sans", -apple-system, sans-serif' }}
              >
                {v.title}
              </h3>
              <p
                className={`text-xs line-clamp-2 ${
                  darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"
                }`}
                style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
              >
                {v.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Upload progress note */}
      {uploadedCount < 28 && (
        <p className={`mt-6 text-xs text-center ${darkMode ? "text-[#5A6A7B]" : "text-[#C4C8CA]"}`}>
          {uploadedCount} of 28 tutorial videos available · More episodes releasing soon
        </p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [darkMode, setDarkMode] = useState(true)
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

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

  const faqs = [
    {
      id: "1",
      question: "How do I create a new report?",
      answer:
        "Click the 'New Report' button in the sidebar. Follow the 8-step workflow to complete your report. You can save drafts at any time and return to them later.",
    },
    {
      id: "2",
      question: "What hazard types are supported?",
      answer:
        "Restore Assist supports all major hazard types: Water damage, Fire damage, Storm damage, Flood damage, Mould, Biohazard, and Impact damage. Each has specific compliance requirements.",
    },
    {
      id: "3",
      question: "How do I integrate with Ascora CRM?",
      answer:
        "Go to Settings > Integrations and click 'Connect' on the Ascora CRM card. You'll need your Ascora API credentials. Once connected, reports will automatically sync.",
    },
    {
      id: "4",
      question: "Can I customise cost libraries?",
      answer:
        "Yes! Go to Cost Libraries and select a library to edit. You can modify rates, add new items, or create custom libraries for different regions.",
    },
    {
      id: "5",
      question: "How is my data protected?",
      answer:
        "All data is encrypted in transit and at rest. We comply with Australian Privacy Act and maintain regular security audits. Your data is never shared with third parties.",
    },
  ]

  const supportChannels = [
    {
      icon: Mail,
      title: "Email Support",
      description: "airestoreassist@gmail.com",
      response: "24-48 hours",
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      description: "Available in app",
      response: "Available 24/7",
    },
  ]

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
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
            Help & Support
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Find answers, watch tutorials, and get support for Restore Assist
          </motion.p>
        </div>
      </section>

      {/* Video Tutorials */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 right-1/3 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-3">
              <PlayCircle size={28} className="text-[#8A6B4E]" />
              <h2
                className={`text-3xl font-bold ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
                style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                Video Tutorials
              </h2>
            </div>
            <p
              className={`text-base ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
              style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
            >
              28 step-by-step tutorials covering every feature of RestoreAssist, grouped into five learning series.
            </p>
          </motion.div>
          <VideoTutorials darkMode={darkMode} />
        </div>
      </section>

      {/* Support Channels */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          {/* Support channels */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {supportChannels.map((channel, i) => {
              const Icon = channel.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className={`p-8 rounded-lg border backdrop-blur-sm transition-all ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 hover:bg-[#1C2E47]/70' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 hover:bg-[#F4F5F6]/70'}`}
                >
                  <Icon size={28} className="mb-4 text-[#8A6B4E]" />
                  <h3
                    className={`text-xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
                    style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                  >
                    {channel.title}
                  </h3>
                  <p
                    className={`text-base mb-3 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
                    style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
                  >
                    {channel.description}
                  </p>
                  <p
                    className="text-sm text-[#5A6A7B]"
                    style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
                  >
                    Response: {channel.response}
                  </p>
                </motion.div>
              )
            })}
          </div>

          {/* Resources */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {[
              { icon: BookOpen, title: "Documentation", description: "Complete guides and API references", href: null },
              { icon: Video, title: "Video Tutorials", description: "28 how-to videos above", href: "#tutorials", scroll: true },
            ].map((resource, i) => {
              const Icon = resource.icon
              return (
                <motion.button
                  key={i}
                  onClick={() => {
                    if (resource.scroll) {
                      document.querySelector('section')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: (i + 2) * 0.1 }}
                  className={`p-8 rounded-lg border backdrop-blur-sm transition-all text-left group ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30 hover:bg-[#1C2E47]/70' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20 hover:bg-[#F4F5F6]/70'}`}
                >
                  <Icon size={28} className="mb-4 text-[#8A6B4E] group-hover:scale-110 transition-transform" />
                  <h3
                    className={`text-xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
                    style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                  >
                    {resource.title}
                  </h3>
                  <p
                    className={`text-base ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
                    style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
                  >
                    {resource.description}
                  </p>
                </motion.button>
              )
            })}
          </div>

          {/* FAQs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className={`p-8 rounded-lg border backdrop-blur-sm ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20'}`}
          >
            <h2
              className={`text-3xl font-bold mb-8 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
              style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div
                  key={faq.id}
                  className={`rounded-lg overflow-hidden border ${darkMode ? 'border-[#5A6A7B]/30 bg-[#1C2E47]/30' : 'border-[#5A6A7B]/20 bg-[#F4F5F6]/30'}`}
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    className={`w-full p-6 flex items-center justify-between transition-colors text-left ${darkMode ? 'hover:bg-[#1C2E47]/70' : 'hover:bg-[#F4F5F6]/70'}`}
                  >
                    <span
                      className={`font-semibold text-lg ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
                      style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                    >
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={20}
                      className={`transition-transform ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'} ${expandedFaq === faq.id ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {expandedFaq === faq.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div
                          className={`p-6 border-t ${darkMode ? 'border-[#5A6A7B]/30 bg-[#1C2E47]/20 text-[#C4C8CA]' : 'border-[#5A6A7B]/20 bg-[#F4F5F6]/20 text-[#5A6A7B]'}`}
                          style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
                        >
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
