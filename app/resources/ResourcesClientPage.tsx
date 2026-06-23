"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import Footer from "@/components/landing/Footer";

export default function ResourcesClientPage() {
  const [darkMode] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!document.getElementById("google-fonts-preconnect")) {
      const link1 = document.createElement("link");
      link1.id = "google-fonts-preconnect";
      link1.rel = "preconnect";
      link1.href = "https://fonts.googleapis.com";
      document.head.appendChild(link1);

      const link2 = document.createElement("link");
      link2.rel = "preconnect";
      link2.href = "https://fonts.gstatic.com";
      link2.crossOrigin = "anonymous";
      document.head.appendChild(link2);

      const link3 = document.createElement("link");
      link3.href =
        "https://fonts.googleapis.com/css2?family=Open+Sauce+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap";
      link3.rel = "stylesheet";
      document.head.appendChild(link3);
    }
  }, []);

  const resourceCategories: {
    category: string;
    items: {
      title: string;
      description: string;
      link?: string;
      comingSoon?: boolean;
    }[];
  }[] = [
    {
      category: "Documentation",
      items: [
        {
          title: "Getting Started Guide",
          description: "Learn the basics of using RestoreAssist",
          link: "/help",
        },
        {
          title: "API Documentation",
          description: "Integrate RestoreAssist with your systems",
          comingSoon: true,
        },
        {
          title: "Compliance Library",
          description: "Access compliance standards and guidelines",
          link: "/compliance-library",
        },
      ],
    },
    {
      category: "Support",
      items: [
        {
          title: "Help Centre",
          description: "Find answers to common questions",
          link: "/help",
        },
        {
          title: "Contact Support",
          description: "Get help from our support team",
          link: "/contact",
        },
      ],
    },
    {
      category: "Community",
      items: [
        {
          title: "Blog",
          description: "Read the latest updates and insights",
          link: "/blog",
        },
        {
          title: "Case Studies",
          description: "See how others use RestoreAssist",
          comingSoon: true,
        },
        {
          title: "Webinars",
          description: "Join live training sessions",
          comingSoon: true,
        },
      ],
    },
  ];

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      {/* Header */}
      <header className="fixed top-0 w-full z-[100] bg-brand-navy/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex items-center justify-center relative overflow-hidden">
                <Image
                  src="/logo.png"
                  alt="Restore Assist Logo"
                  width={100}
                  height={100}
                  className="object-contain p-1 md:p-2"
                />
              </div>
            </Link>
          </div>

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
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{
                duration: 0.35,
                ease: [0.32, 0.72, 0, 1],
                opacity: { duration: 0.2 },
              }}
              className="fixed top-0 right-0 h-screen w-80 max-w-[85vw] bg-brand-navy border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[160] overflow-hidden flex flex-col"
            >
              <div className="flex-shrink-0 bg-brand-navy border-b border-white/10 px-6 py-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white uppercase tracking-wider">
                  Menu
                </h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-white hover:text-gray-300 transition-colors p-2 -mr-2 rounded-lg hover:bg-white/10"
                  aria-label="Close menu"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                  <nav className="space-y-1">
                    {[
                      { href: "/features", label: "Features" },
                      { href: "/solutions", label: "Solutions" },
                      { href: "/pricing", label: "Pricing" },
                      { href: "/resources", label: "Resources" },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="pt-6 mt-6 border-t border-white/10 space-y-3">
                    <Link
                      href="/pricing"
                      className="block w-full px-6 py-3 bg-brand-slate text-white rounded-lg text-center font-medium hover:bg-brand-slate/80 transition-all duration-200 shadow-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Pricing
                    </Link>
                    <Link
                      href="/login"
                      className="block w-full px-6 py-3 bg-brand-bronze text-white rounded-lg text-center font-medium hover:bg-brand-bronze/80 transition-all duration-200 shadow-lg"
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

      {/* Hero */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl font-bold mb-6 leading-tight text-brand-cloud"
            style={{
              fontFamily:
                '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Resources
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl text-brand-mist"
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Everything you need to get the most out of RestoreAssist.
          </motion.p>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-brand-bronze/12 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-brand-bronze/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-3 gap-8">
            {resourceCategories.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="p-6 rounded-lg bg-brand-navy/50 backdrop-blur-sm border border-brand-slate/30"
              >
                <h3
                  className="text-2xl font-bold mb-6 text-brand-cloud"
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {category.category}
                </h3>
                <div className="space-y-4">
                  {category.items.map((item, idx) => {
                    const cardInner = (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <h4
                            className="text-lg font-semibold text-brand-cloud"
                            style={{
                              fontFamily:
                                '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            }}
                          >
                            {item.title}
                          </h4>
                          {item.comingSoon && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-brand-bronze/20 text-brand-bronze border border-brand-bronze/30">
                              Coming Soon
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-brand-mist">
                          {item.description}
                        </p>
                      </>
                    );

                    // Render a real link only when there's a destination; an
                    // item flagged "Coming Soon" has no route yet, so it renders
                    // as a non-interactive card instead of a dead "#" link.
                    return item.link ? (
                      <Link
                        key={idx}
                        href={item.link}
                        className="block p-4 rounded-lg transition-colors hover:bg-brand-navy/70"
                      >
                        {cardInner}
                      </Link>
                    ) : (
                      <div
                        key={idx}
                        aria-disabled="true"
                        className="block p-4 rounded-lg opacity-70 cursor-default"
                      >
                        {cardInner}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  );
}
