"use client"

import { motion } from "framer-motion"
import { Star } from "lucide-react"
import SectionWrapper from "./SectionWrapper"
import SectionHeader from "./SectionHeader"
import TestimonialCard from "./TestimonialCard"

const testimonials = [
  {
    quote: "Restore Assist has cut our report generation time from hours to minutes. The NCC compliance checks are invaluable.",
    author: "Sarah Mitchell",
    title: "Restoration Manager",
    company: "Sydney",
    stat: "75% time saved",
    color: "from-blue-500 to-cyan-500"
  },
  {
    quote: "The accuracy of cost estimates is impressive. Reports are professional and always accepted by insurers.",
    author: "James Chen",
    title: "Insurance Assessor",
    company: "Melbourne",
    stat: "200+ reports completed",
    color: "from-emerald-500 to-teal-500"
  },
  {
    quote: "Finally, a tool that understands Australian building standards. The state-specific compliance notes save us so much time.",
    author: "Lisa Anderson",
    title: "Property Manager",
    company: "Brisbane",
    stat: "40% admin reduction",
    color: "from-purple-500 to-pink-500"
  }
]

export default function TestimonialsSection() {
  return (
    <SectionWrapper id="testimonials" background="dark">
      <SectionHeader 
        title="Trusted by Restoration Professionals"
        subtitle="See what Australian restoration experts are saying about Restore Assist"
      />
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {testimonials.map((testimonial, index) => (
          <TestimonialCard
            key={index}
            quote={testimonial.quote}
            author={testimonial.author}
            title={testimonial.title}
            company={testimonial.company}
            stat={testimonial.stat}
            color={testimonial.color}
            delay={index * 0.1}
          />
        ))}
      </div>

      {/* Trust Indicators */}
      <motion.div 
        className="mt-16 text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <div className="inline-flex items-center gap-6 px-8 py-4 bg-slate-800/50 border border-slate-700/50 rounded-full">
          <div className="flex items-center gap-2">
            <Star size={20} className="text-yellow-400 fill-current" />
            <Star size={20} className="text-yellow-400 fill-current" />
            <Star size={20} className="text-yellow-400 fill-current" />
            <Star size={20} className="text-yellow-400 fill-current" />
            <Star size={20} className="text-yellow-400 fill-current" />
          </div>
          <span className="text-slate-300 font-medium">
            Rated 4.9/5 by Australian restoration professionals
          </span>
        </div>
      </motion.div>
    </SectionWrapper>
  )
}
