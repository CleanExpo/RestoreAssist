"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { getAllArticles } from "@/lib/blog/articles";

export default function BlogPage() {
  const [darkMode, setDarkMode] = useState(true);

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

  // Article content + metadata is sourced from lib/blog/articles.ts so the
  // listing, the /blog/[slug] route, and the route-integrity test never drift.
  const blogPosts = getAllArticles();

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-brand-mist/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
            style={{
              fontFamily:
                '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Blog
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
            style={{
              fontFamily:
                '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Insights, tips, and updates from the restoration industry.
          </motion.p>
        </div>
      </section>

      {/* Blog Posts */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-brand-bronze/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-brand-bronze/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post, index) => (
              <motion.div
                key={post.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-6 rounded-lg border ${darkMode ? "bg-brand-navy/50 border-brand-slate/30" : "bg-brand-cloud/50 border-brand-slate/20"} backdrop-blur-sm hover:border-brand-bronze transition-colors`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`text-xs px-3 py-1 rounded-full ${darkMode ? "bg-brand-bronze/20 text-brand-bronze" : "bg-brand-bronze/10 text-brand-bronze"}`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {post.category}
                  </span>
                  <span
                    className={`text-xs ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {post.readTime}
                  </span>
                </div>
                <h3
                  className={`text-xl font-bold mb-3 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {post.title}
                </h3>
                <p
                  className={`text-sm mb-4 leading-relaxed ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {post.date}
                  </span>
                  {/* Published articles link to their /blog/[slug] route.
                      Any article still flagged unpublished falls back to a
                      non-interactive "Coming Soon" badge — never a dead
                      href="#" link. */}
                  {post.published ? (
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-sm font-medium text-brand-bronze hover:text-brand-bronze/80 transition-colors"
                      style={{
                        fontFamily:
                          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      }}
                    >
                      Read article
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className={`text-sm font-medium ${darkMode ? "text-brand-bronze/70" : "text-brand-bronze/70"}`}
                      style={{
                        fontFamily:
                          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      }}
                    >
                      Coming Soon
                    </span>
                  )}
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
