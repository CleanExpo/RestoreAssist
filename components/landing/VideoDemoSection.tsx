"use client"

import React, { useRef, useState } from "react"
import { motion } from "framer-motion"

interface VideoCardProps {
  src: string
  poster?: string
  title: string
  subtitle: string
  duration: string
}

export function VideoCard({ src, poster, title, subtitle, duration }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const handlePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="relative group cursor-pointer"
      onClick={handlePlay}
    >
      <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-[#8A6B4E]/30">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full h-full object-cover"
          onEnded={() => setIsPlaying(false)}
          controls={isPlaying}
        />
        {!isPlaying && (
          <div className="absolute inset-0 bg-[#1C2E47]/60 flex items-center justify-center transition-all duration-300 group-hover:bg-[#1C2E47]/40">
            <div className="w-20 h-20 rounded-full bg-[#8A6B4E] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {duration}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-white/70 mt-1">{subtitle}</p>
      </div>
    </motion.div>
  )
}

export default function VideoDemoSection() {
  return (
    <section className="py-20 px-6 bg-[#1C2E47]">
      <div className="max-w-7xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-white text-center mb-4"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          See RestoreAssist in Action
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-lg text-white/70 text-center mb-12 max-w-2xl mx-auto"
        >
          Watch how RestoreAssist streamlines the restoration workflow from inspection to invoice.
        </motion.p>
        <div className="grid md:grid-cols-2 gap-8">
          <VideoCard
            src="/videos/product-explainer.mp4"
            title="How RestoreAssist Generates a Scope of Works"
            subtitle="See AI-powered scope generation in action — from inspection to export"
            duration="1:00"
          />
          <VideoCard
            src="/videos/industry-insight.mp4"
            title="The Most Common Mistake Restorers Make"
            subtitle="Educational — Missing vital data during the inspection process"
            duration="2:30"
          />
        </div>
      </div>
    </section>
  )
}
