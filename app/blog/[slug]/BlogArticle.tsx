"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import type { Article } from "@/lib/blog/articles";

const HEADING_FONT =
  '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const BODY_FONT =
  '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/**
 * Client shell for a single blog article.
 *
 * The parent server component (app/blog/[slug]/page.tsx) owns metadata,
 * static params and the not-found gate. This shell only carries the
 * site's dark-mode toggle and renders the (fully serialisable) article
 * data — no client data-fetching, no interactivity beyond the theme
 * switch the rest of the marketing site already uses.
 */
export default function BlogArticle({ article }: { article: Article }) {
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

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero */}
      <section className="pt-40 pb-12 px-6 relative z-10 bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-3xl mx-auto w-full relative z-10">
          <Link
            href="/blog"
            className={`inline-flex items-center gap-2 text-sm mb-8 transition-colors ${darkMode ? "text-brand-mist hover:text-brand-cloud" : "text-brand-slate hover:text-brand-navy"}`}
            style={{ fontFamily: BODY_FONT }}
          >
            <span aria-hidden="true">&larr;</span> Back to Blog
          </Link>

          <div className="flex items-center gap-3 mb-5">
            <span
              className="text-xs px-3 py-1 rounded-full bg-brand-bronze/20 text-brand-bronze"
              style={{ fontFamily: BODY_FONT }}
            >
              {article.category}
            </span>
            <span
              className={`text-xs ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}
              style={{ fontFamily: BODY_FONT }}
            >
              {article.readTime}
            </span>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className={`text-4xl md:text-5xl font-bold mb-6 leading-tight ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
            style={{ fontFamily: HEADING_FONT }}
          >
            {article.title}
          </motion.h1>

          <div
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
            style={{ fontFamily: BODY_FONT }}
          >
            <span>{article.author}</span>
            <span aria-hidden="true">&middot;</span>
            <time dateTime={article.isoDate}>{article.date}</time>
          </div>
          <p
            className={`mt-1 text-xs ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}
            style={{ fontFamily: BODY_FONT }}
          >
            {article.authorCredential}
          </p>
        </div>
      </section>

      {/* Body */}
      <article className="pb-16 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="max-w-3xl mx-auto relative z-10">
          {article.intro.map((paragraph, index) => (
            <p
              key={`intro-${index}`}
              className={`text-lg leading-relaxed mb-6 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
              style={{ fontFamily: BODY_FONT }}
            >
              {paragraph}
            </p>
          ))}

          {article.sections.map((section, sIndex) => (
            <section key={`section-${sIndex}`} className="mt-10">
              {section.heading ? (
                <h2
                  className={`text-2xl font-bold mb-4 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                  style={{ fontFamily: HEADING_FONT }}
                >
                  {section.heading}
                </h2>
              ) : null}
              {section.paragraphs.map((paragraph, pIndex) => (
                <p
                  key={`section-${sIndex}-p-${pIndex}`}
                  className={`text-base leading-relaxed mb-5 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                  style={{ fontFamily: BODY_FONT }}
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mb-5 space-y-2">
                  {section.bullets.map((bullet, bIndex) => (
                    <li
                      key={`section-${sIndex}-b-${bIndex}`}
                      className={`flex gap-3 text-base leading-relaxed ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                      style={{ fontFamily: BODY_FONT }}
                    >
                      <span aria-hidden="true" className="text-brand-bronze mt-1">
                        &bull;
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          {/* Key takeaways */}
          {article.keyTakeaways && article.keyTakeaways.length > 0 ? (
            <div
              className={`mt-12 p-6 rounded-lg border ${darkMode ? "bg-brand-navy/50 border-brand-slate/30" : "bg-brand-cloud/60 border-brand-slate/20"} backdrop-blur-sm`}
            >
              <h2
                className={`text-xl font-bold mb-4 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                style={{ fontFamily: HEADING_FONT }}
              >
                Key takeaways
              </h2>
              <ul className="space-y-2">
                {article.keyTakeaways.map((item, index) => (
                  <li
                    key={`takeaway-${index}`}
                    className={`flex gap-3 text-base leading-relaxed ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                    style={{ fontFamily: BODY_FONT }}
                  >
                    <span aria-hidden="true" className="text-brand-bronze mt-1">
                      &bull;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* References / substantiation */}
          {article.references && article.references.length > 0 ? (
            <div className="mt-10">
              <h2
                className={`text-lg font-bold mb-3 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                style={{ fontFamily: HEADING_FONT }}
              >
                References
              </h2>
              <ul className="space-y-2">
                {article.references.map((reference, index) => (
                  <li
                    key={`reference-${index}`}
                    className={`text-sm leading-relaxed ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}
                    style={{ fontFamily: BODY_FONT }}
                  >
                    <span className="font-semibold text-brand-bronze">
                      {reference.label}
                    </span>{" "}
                    &mdash; {reference.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* CTA */}
          <div
            className={`mt-12 p-8 rounded-lg border text-center ${darkMode ? "bg-brand-navy/50 border-brand-slate/30" : "bg-brand-cloud/60 border-brand-slate/20"} backdrop-blur-sm`}
          >
            <p
              className={`text-lg font-semibold mb-4 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
              style={{ fontFamily: HEADING_FONT }}
            >
              Put IICRC S500 compliance on autopilot
            </p>
            <p
              className={`text-sm mb-6 leading-relaxed ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
              style={{ fontFamily: BODY_FONT }}
            >
              RestoreAssist maps every field you capture to its governing
              standard clause, so every finding in the report is tied to a
              published clause &mdash; not to technician memory. Start a 15-day
              free trial, no credit card required.
            </p>
            <Link
              href="/signup"
              className="inline-block px-6 py-3 rounded-lg font-medium text-sm bg-brand-bronze text-brand-cloud hover:bg-brand-bronze/80 transition-colors"
              style={{ fontFamily: BODY_FONT }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  );
}
