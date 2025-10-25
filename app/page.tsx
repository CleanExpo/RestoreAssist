"use client"

import { motion } from "framer-motion"
import {
  Award,
  Bot,
  Briefcase,
  Building,
  Calculator,
  Camera,
  CheckCircle2,
  Database,
  FileCheck,
  FileText,
  Globe,
  Home as HomeIcon,
  Lock,
  Menu,
  Shield,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  X
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

// Import components
import DamageTypesSection from "@/components/landing/DamageTypesSection"
import FAQItem from "@/components/landing/FAQItem"
import FeatureCard from "@/components/landing/FeatureCard"
import FinalCTASection from "@/components/landing/FinalCTASection"
import HeroSection from "@/components/landing/HeroSection"
import PlatformFeaturesSection from "@/components/landing/PlatformFeaturesSection"
import PricingCard from "@/components/landing/PricingCard"
import SectionHeader from "@/components/landing/SectionHeader"
import SectionWrapper from "@/components/landing/SectionWrapper"
import StatesCoverageSection from "@/components/landing/StatesCoverageSection"
import TestimonialsSection from "@/components/landing/TestimonialsSection"
import VideoDemoSection from "@/components/landing/VideoDemoSection"

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 overflow-hidden">
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 w-full z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <motion.div 
            className="flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">RA</span>
            </div>
            <span className="font-semibold text-lg" style={{ fontFamily: 'Titillium Web, sans-serif' }}>Restore Assist</span>
          </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <motion.a 
              href="#features" 
              className="text-slate-300 hover:text-white transition-colors"
              whileHover={{ y: -2 }}
            >
              Features
            </motion.a>
            <motion.a 
              href="#solutions" 
              className="text-slate-300 hover:text-white transition-colors"
              whileHover={{ y: -2 }}
            >
              Solutions
            </motion.a>
            <motion.a 
              href="#pricing" 
              className="text-slate-300 hover:text-white transition-colors"
              whileHover={{ y: -2 }}
            >
              Pricing
            </motion.a>
            <motion.a 
              href="#resources" 
              className="text-slate-300 hover:text-white transition-colors"
              whileHover={{ y: -2 }}
            >
              Resources
            </motion.a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-slate-300 hover:text-white transition-colors">
              Login
            </Link>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
            <Link
              href="/signup"
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300"
            >
              Start Free Trial
            </Link>
            </motion.div>
          </div>

          {/* Mobile Menu Button */}
          <motion.button 
            className="md:hidden" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            whileTap={{ scale: 0.95 }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </motion.button>
        </div>

        {/* Mobile Menu */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ 
            opacity: mobileMenuOpen ? 1 : 0, 
            height: mobileMenuOpen ? "auto" : 0 
          }}
          transition={{ duration: 0.3 }}
          className="md:hidden bg-slate-900 border-t border-slate-800 overflow-hidden"
        >
          <div className="p-4 space-y-4">
            <a href="#features" className="block text-slate-300 hover:text-white">
              Features
            </a>
            <a href="#solutions" className="block text-slate-300 hover:text-white">
              Solutions
            </a>
            <a href="#pricing" className="block text-slate-300 hover:text-white">
              Pricing
            </a>
            <Link
              href="/signup"
              className="block px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg text-center font-medium"
            >
              Start Free Trial
            </Link>
          </div>
        </motion.div>
      </motion.nav>
      {/* Hero Section */}
      <HeroSection />

      {/* Damage Types Coverage Section */}
      <DamageTypesSection />

      {/* Platform Features Section */}
      <PlatformFeaturesSection />

      {/* Video Demo Section */}
      <VideoDemoSection />

      {/* States Coverage Section */}
      <StatesCoverageSection />

      {/* Insurance Types Section */}
      <SectionWrapper id="insurance-types" background="dark">
        <SectionHeader 
          title="Built for Every Policy Type in the Australian Market"
          subtitle="Restore Assist automatically adjusts scope, evidence requirements, and compliance notes based on the insurance policy—ensuring accurate claims and faster approvals."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              title: "Building & Contents Insurance",
              description: "Separates structural repairs from contents restoration. Addresses both dwelling damage and personal belongings for comprehensive coverage.",
              icon: HomeIcon,
              color: "from-blue-500 to-cyan-500"
            },
            {
              title: "Standalone Building Insurance", 
              description: "Focuses exclusively on structural repairs—walls, roofs, permanent fixtures. Contents damage excluded from scope.",
              icon: Building,
              color: "from-cyan-500 to-teal-500"
            },
            {
              title: "Standalone Contents Insurance",
              description: "Emphasizes cleaning, drying, or replacement of personal belongings. Structural repairs not covered.",
              icon: Briefcase,
              color: "from-teal-500 to-green-500"
            },
            {
              title: "Landlord Insurance",
              description: "Includes structural and contents damage plus restoration timelines to calculate lost rent compensation.",
              icon: Users,
              color: "from-green-500 to-emerald-500"
            },
            {
              title: "Body Corporate/Strata Insurance",
              description: "Distinguishes common property (body corporate responsibility) from lot property (owner responsibility). Notes exclusions like removable fixtures, carpets, curtains per strata legislation.",
              icon: Store,
              color: "from-emerald-500 to-blue-500"
            },
            {
              title: "Small Business Property & Contents",
              description: "Covers commercial buildings, furniture, machinery, stock. Tailors scope for business-specific assets and operational needs.",
              icon: Briefcase,
              color: "from-blue-500 to-purple-500"
            },
            {
              title: "Business Interruption Insurance",
              description: "Estimates downtime and calculates lost income, fixed costs, relocation expenses. Requires valid underlying property damage claim.",
              icon: TrendingUp,
              color: "from-purple-500 to-pink-500"
            }
          ].map((policy, i) => (
            <FeatureCard
              key={i}
              title={policy.title}
              description={policy.description}
              icon={policy.icon}
              color={policy.color}
              delay={i * 0.1}
            />
          ))}
        </div>
      </SectionWrapper>

      {/* Standards & Compliance Section */}
      <SectionWrapper id="standards">
        <SectionHeader 
          title="Backed by Industry-Leading Standards"
          subtitle="Every report generated by Restore Assist references the exact standards, codes, and regulations applicable to the job—providing legal defensibility and insurer confidence."
        />

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
              title: "IICRC Standards",
              badge: "ANSI/IICRC Certified",
              description: "S500 (Water Damage), S520 (Mould Remediation), S700 (Fire & Smoke). Ensures inspection, mitigation, drying, and restoration protocols meet international best practices.",
              icon: Award,
              color: "from-blue-500 to-cyan-500"
            },
            {
              title: "Australian Compliance",
              badge: "NCC 2022 Compliant", 
              description: "National Construction Code 2022, state building acts, Work Health and Safety (WHS) regulations. Automatically cited based on property location and hazard type.",
              icon: ShieldCheck,
              color: "from-cyan-500 to-teal-500"
            },
            {
              title: "Regional Cost Data",
              badge: "Cordell & Rawlinsons Integrated",
              description: "Access verified regional pricing for labor, materials, equipment. Produce defensible cost estimates aligned with market rates.",
              icon: Database,
              color: "from-teal-500 to-green-500"
            }
          ].map((standard, i) => (
            <motion.div
                key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.2 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/30 to-slate-800/60 hover:from-slate-800/60 hover:to-slate-800/80 transition-all duration-500 hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/10"
              whileHover={{ y: -5 }}
            >
              <div className={`w-16 h-16 bg-gradient-to-r ${standard.color} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <standard.icon size={32} className="text-white" />
              </div>
              <div className="mb-4">
                <span className="inline-block px-3 py-1 bg-cyan-500/20 text-cyan-400 text-sm font-medium rounded-full border border-cyan-500/30">
                  {standard.badge}
                </span>
              </div>
              <h3 className="text-2xl font-medium mb-4" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                {standard.title}
              </h3>
              <p className="text-slate-400 leading-relaxed font-light">
                {standard.description}
              </p>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* Features Deep Dive Section */}
      <SectionWrapper id="features" background="dark">
        <SectionHeader 
          title="Everything You Need to Deliver Professional Reports"
        />

          <div className="grid md:grid-cols-2 gap-8">
            {[
            {
              title: "Multi-Hazard Support",
              description: "Water, fire, storm, flood, mould, biohazard, impact, and other hazards. One platform for every restoration scenario.",
              icon: Shield,
              color: "from-blue-500 to-cyan-500"
            },
            {
              title: "Dynamic Workflow Engine",
              description: "Forms, checklists, and scope libraries adapt based on hazard type and insurance policy. No unnecessary steps—only what's relevant to the job.",
              icon: FileText,
              color: "from-cyan-500 to-teal-500"
            },
            {
              title: "AI Agent Integration (Your Keys)",
              description: "Connect your Anthropic, OpenAI, or other LLM API keys. The system uses your credits to generate bespoke reports—never consuming Unite-Group Nexus resources.",
              icon: Bot,
              color: "from-teal-500 to-green-500"
            },
              {
                title: "Real-Time Cost Calculation",
              description: "Multiply unit rates by measured quantities (sqm, cubic meters, hours). Adjust for regional variations. Include equipment rental, labor certifications, materials.",
              icon: Calculator,
              color: "from-green-500 to-emerald-500"
            },
            {
              title: "Photo & Data Upload",
              description: "Attach site photos, moisture readings, thermal imaging, smoke particulate data. Timestamped for legal defensibility.",
              icon: Camera,
              color: "from-emerald-500 to-blue-500"
            },
              {
                title: "Compliance Auto-Insertion",
              description: "Relevant NCC sections, state WHS regulations, IICRC standards automatically referenced. Specify required PPE, containment measures, clearance testing.",
              icon: ShieldCheck,
              color: "from-blue-500 to-purple-500"
            },
            {
              title: "Authority to Proceed Documents",
              description: "Generate client and insurer approval forms summarizing scope, costs, timelines. Digital signature fields. Store signed versions with report.",
              icon: FileCheck,
              color: "from-purple-500 to-pink-500"
            },
            {
              title: "Ascora CRM Integration",
              description: "Bi-directional sync of customers, jobs, status updates, invoicing. Push line-item scopes and estimates directly into job management or accounting systems.",
              icon: Database,
              color: "from-pink-500 to-red-500"
            }
            ].map((feature, i) => (
            <FeatureCard
                key={i}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
              color={feature.color}
              delay={i * 0.1}
            />
          ))}
        </div>
      </SectionWrapper>

      {/* Data Security & Client Control Section */}
      <SectionWrapper id="security">
        <SectionHeader 
          title="Your Data. Your Keys. Your Control."
        />

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: "Client-Supplied AI Keys",
              description: "You provide your own Anthropic or OpenAI API keys. We store them securely (encrypted at rest) and use them exclusively for your reports. Your usage, your billing.",
              icon: Lock,
              color: "from-blue-500 to-cyan-500"
            },
            {
              title: "Immutable Audit Trail",
              description: "Every action logged with timestamps and user IDs. Previous report versions preserved. Defensible chain of custody for legal or insurance disputes.",
              icon: Database,
              color: "from-cyan-500 to-teal-500"
            },
            {
              title: "Data Sovereignty",
              description: "PostgreSQL database hosted in Australia. Compliant with Australian privacy laws. Optional on-premises deployment for enterprise clients.",
              icon: Globe,
              color: "from-teal-500 to-green-500"
            }
          ].map((security, i) => (
            <FeatureCard
                key={i}
              title={security.title}
              description={security.description}
              icon={security.icon}
              color={security.color}
              delay={i * 0.2}
            />
          ))}
        </div>
      </SectionWrapper>

      {/* Pricing Section */}
      <SectionWrapper id="pricing" background="dark">
        <SectionHeader 
          title="Simple, Transparent Pricing"
          subtitle="Start with 3 free reports, then choose the plan that fits your business. All plans include NCC 2022 compliance."
        />

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
              name: "Free Trial",
              price: "$0",
              period: "",
                features: [
                "3 free reports",
                "PDF export",
                  "Basic support",
                "NCC 2022 compliant"
                ],
                cta: "Start Free Trial",
              delay: 0
              },
              {
              name: "Monthly Plan",
              price: "$49.50",
                period: "/month",
                features: [
                  "Unlimited reports",
                "PDF & Excel export",
                "Email support",
                "All integrations",
                "NCC 2022 compliant",
                "Priority processing"
              ],
              cta: "Start Monthly Plan",
                popular: true,
              delay: 0.2
            },
            {
              name: "Yearly Plan",
              price: "$528",
              period: "/year",
                features: [
                "Unlimited reports",
                "PDF & Excel export",
                "Priority support",
                "All integrations",
                "NCC 2022 compliant",
                "Priority processing",
                "10% discount - Save $66/year"
              ],
              cta: "Start Yearly Plan",
              badge: "Best Value",
              delay: 0.4
            }
            ].map((plan, i) => (
            <PricingCard
                key={i}
              name={plan.name}
              price={plan.price}
              period={plan.period}
              features={plan.features}
              cta={plan.cta}
              popular={plan.popular}
              badge={plan.badge}
              delay={plan.delay}
            />
            ))}
          </div>

        {/* 30-Day Money-Back Guarantee */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-500/20 border border-emerald-500/30 rounded-full mb-8">
            <CheckCircle2 size={24} className="text-emerald-400" />
            <span className="text-emerald-400 font-medium text-lg">30-Day Money-Back Guarantee</span>
          </div>
          <p className="text-slate-300 text-lg max-w-3xl mx-auto font-light">
            Try Restore Assist risk-free. If you're not completely satisfied within 30 days, we'll refund your payment—no questions asked.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <div className="grid md:grid-cols-3 gap-8 text-slate-400">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <span className="text-lg font-medium">3 Free Trial Reports</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <span className="text-lg font-medium">No credit card required</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <span className="text-lg font-medium">Cancel anytime</span>
          </div>
        </div>
          <p className="mt-8 text-slate-500 text-lg font-medium">
            Australian-owned & operated
          </p>
        </motion.div>
      </SectionWrapper>

      {/* Testimonials Section */}
      <TestimonialsSection />

      {/* FAQ Section */}
      <SectionWrapper id="faq" background="dark">
        <SectionHeader 
          title="Frequently Asked Questions"
        />

        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {[
              {
                question: "What types of restoration claims does Restore Assist support?",
                answer: "All property restoration claims including water, fire, storm, flood, mould, biohazard, impact damage, and other hazards. It covers building, contents, landlord, strata/body corporate, small business property, and business interruption insurance policies."
              },
              {
                question: "Do I need to provide my own AI API keys?",
                answer: "Yes. Restore Assist allows you to connect your own Anthropic, OpenAI, or other LLM API keys. This ensures your usage costs are separate from our platform fees and gives you full control over AI features."
              },
              {
                question: "Is Restore Assist compliant with Australian standards?",
                answer: "Absolutely. Every report references IICRC standards (S500, S520, S700), National Construction Code 2022, state building acts, and Work Health and Safety regulations relevant to the property's location and hazard type."
              },
              {
                question: "Can I integrate Restore Assist with my existing CRM or accounting software?",
                answer: "Yes. Restore Assist includes built-in Ascora CRM integration with bi-directional syncing of customers, jobs, and invoicing. Enterprise plans offer API access for custom integrations."
              },
              {
                question: "How do you ensure data security and legal defensibility?",
                answer: "All actions are logged with timestamps and user IDs. Previous report versions are preserved for audit purposes. Data is encrypted at rest and in transit, hosted in Australia, and compliant with Australian privacy laws."
              },
              {
                question: "What happens to my data if I cancel?",
                answer: "You can export all your data (reports, client information, cost libraries) before cancellation. We retain data for 30 days after cancellation for recovery, then permanently delete it per our data retention policy."
              }
            ].map((faq, i) => (
              <FAQItem
                key={i}
                question={faq.question}
                answer={faq.answer}
                isOpen={openFAQ === i}
                onToggle={() => setOpenFAQ(openFAQ === i ? null : i)}
                delay={i * 0.1}
              />
            ))}
          </div>
        </div>
      </SectionWrapper>

      {/* Final CTA Section */}
      <FinalCTASection />

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-8 mb-12">
            <div className="md:col-span-2">
              <motion.div 
                className="flex items-center gap-3 mb-6"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
              >
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-medium text-lg">RA</span>
                </div>
                <span className="font-medium text-2xl" style={{ fontFamily: 'Titillium Web, sans-serif' }}>Restore Assist</span>
              </motion.div>
              <motion.p 
                className="text-slate-400 text-lg mb-6 max-w-md font-light"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                viewport={{ once: true }}
              >
                AI-powered damage assessment platform for Australian restoration professionals. Built with Claude Opus 4.
              </motion.p>
              <motion.div 
                className="text-slate-500 text-sm font-light"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <p>Restore Assist by Unite-Group Nexus Pty Ltd</p>
                <p>ABN: [Company ABN]</p>
                <p>Address: [Company Address]</p>
              </motion.div>
            </div>
            
            <div>
              <motion.h4 
                className="font-medium text-lg mb-6"
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                viewport={{ once: true }}
              >
                Product
              </motion.h4>
              <motion.ul 
                className="space-y-3 text-slate-400"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <li><a href="#platform-features" className="hover:text-white transition-colors font-light">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors font-light">Pricing</a></li>
                <li><a href="#video-demo" className="hover:text-white transition-colors font-light">Dashboard</a></li>
                <li><a href="#platform-features" className="hover:text-white transition-colors font-light">Analytics</a></li>
              </motion.ul>
            </div>
            
            <div>
              <motion.h4 
                className="font-medium text-lg mb-6"
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                viewport={{ once: true }}
              >
                Resources
              </motion.h4>
              <motion.ul 
                className="space-y-3 text-slate-400"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                viewport={{ once: true }}
              >
                <li><a href="#" className="hover:text-white transition-colors font-light">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors font-light">API Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors font-light">Compliance Library</a></li>
                <li><a href="#" className="hover:text-white transition-colors font-light">Blog</a></li>
              </motion.ul>
            </div>
            
            <div>
              <motion.h4 
                className="font-medium text-lg mb-6"
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                viewport={{ once: true }}
              >
                Company
              </motion.h4>
              <motion.ul 
                className="space-y-3 text-slate-400"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                viewport={{ once: true }}
              >
                <li><a href="#" className="hover:text-white transition-colors font-light">About</a></li>
                <li><a href="#video-demo" className="hover:text-white transition-colors font-light">How It Works</a></li>
                <li><a href="#states-coverage" className="hover:text-white transition-colors font-light">Compliance</a></li>
                <li><a href="#" className="hover:text-white transition-colors font-light">Contact</a></li>
              </motion.ul>
            </div>
          </div>
          
          <motion.div 
            className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between text-slate-400"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-0">
              <p className="font-light">© 2025 Unite-Group Nexus Pty Ltd. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <a href="#" className="hover:text-white transition-colors font-light">LinkedIn</a>
                <a href="#" className="hover:text-white transition-colors font-light">Twitter/X</a>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm font-light">
              <span>Australian Owned</span>
              <span>IICRC Compliant</span>
              <span>NCC 2022 Verified</span>
              <a href="#" className="hover:text-white transition-colors">View Full Disclaimer</a>
          </div>
          </motion.div>
        </div>
      </footer>
    </div>
  )
}
