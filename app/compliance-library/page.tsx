"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
export default function ComplianceLibraryPage() {
  const darkMode = false;

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

  const documents = [
    {
      category: "IICRC Standards",
      items: [
        {
          title: "IICRC S500 Standard",
          description:
            "Standard and Reference Guide for Professional Water Damage Restoration",
          publisher: "IICRC",
          scope: "Used in Australia and New Zealand",
        },
        {
          title: "IICRC S520 Standard",
          description:
            "Standard and Reference Guide for Professional Mold Remediation",
          publisher: "IICRC",
          scope: "Used in Australia and New Zealand",
        },
      ],
    },
    {
      category: "Australian Standards",
      items: [
        {
          title: "AS/NZS ISO 9001",
          description: "Quality management systems - Requirements",
          publisher: "Standards Australia and Standards New Zealand",
          scope: "Used in Australia and New Zealand",
        },
        {
          title: "National Construction Code (NCC)",
          description:
            "Volumes One and Two hold the Building Code of Australia; Volume Three is the Plumbing Code of Australia. Check the edition in force for your job.",
          publisher: "Australian Building Codes Board",
          scope: "Applies in Australia only",
        },
      ],
    },
    {
      category: "Insurance",
      items: [
        {
          title: "General Insurance Code of Practice",
          description:
            "The code subscribing insurers follow when they handle a claim",
          publisher: "Insurance Council of Australia",
          scope: "Applies in Australia only",
        },
      ],
    },
  ];

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-brand-mist/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl"></div>
        </div>
        <div className="w-full max-w-[80%] mx-auto w-full relative z-10">
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
            Compliance Library
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
            A reference list of the standards and codes restoration work is
            checked against. Each entry says where it applies. We do not host
            or sell these documents: get the current edition from each
            publisher.
          </motion.p>
        </div>
      </section>

      {/* Documents Grid */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-brand-bronze/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-brand-bronze/10 rounded-full blur-3xl"></div>
        </div>
        <div className="w-full max-w-[80%] mx-auto relative z-10">
          <div className="space-y-12">
            {documents.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <h2
                  className={`text-2xl font-bold mb-6 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {category.category}
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {category.items.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-6 rounded-lg border ${darkMode ? "bg-brand-navy/50 border-brand-slate/30" : "bg-brand-cloud/50 border-brand-slate/20"} backdrop-blur-sm hover:border-brand-bronze transition-colors`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3
                          className={`text-lg font-semibold flex-1 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                          style={{
                            fontFamily:
                              '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          }}
                        >
                          {item.title}
                        </h3>
                      </div>
                      <p
                        className={`text-sm mb-4 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        {item.description}
                      </p>
                      <p
                        className={`text-sm font-medium ${darkMode ? "text-brand-bronze" : "text-brand-bronze"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        Published by {item.publisher}
                      </p>
                      <p
                        className={`mt-1 text-sm ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                      >
                        {item.scope}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
