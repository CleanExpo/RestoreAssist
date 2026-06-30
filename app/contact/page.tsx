"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export default function ContactPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: "Website contact enquiry",
          body: form.message.trim(),
          category: "general",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const issue =
          Array.isArray(data?.issues) && data.issues[0]?.message
            ? (data.issues[0].message as string)
            : null;
        throw new Error(
          issue || data?.error || "Something went wrong. Please try again.",
        );
      }
      setStatus("success");
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  };

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

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-brand-mist/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10 text-center">
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
            Contact Us
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
            Get in touch with our team. We're here to help.
          </motion.p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-brand-bronze/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-brand-bronze/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-12 mb-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2
                className={`text-2xl font-bold mb-6 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                style={{
                  fontFamily:
                    '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
              >
                Get in Touch
              </h2>
              <div className="space-y-4">
                <div>
                  <h3
                    className={`text-lg font-semibold mb-2 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                    style={{
                      fontFamily:
                        '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    Email
                  </h3>
                  <p
                    className={`${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    airestoreassist@gmail.com
                  </p>
                </div>

                <div>
                  <h3
                    className={`text-lg font-semibold mb-2 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                    style={{
                      fontFamily:
                        '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    Office Hours
                  </h3>
                  <p
                    className={`${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
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
              <h2
                className={`text-2xl font-bold mb-6 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                style={{
                  fontFamily:
                    '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
              >
                Send a Message
              </h2>
              {/* WebMCP annotations expose this form to in-browser AI agents per
                  the GEO standard (Pi-CEO skills/geo-optimization/SKILL.md §5). */}
              <form
                className="space-y-4"
                onSubmit={handleSubmit}
                // @ts-expect-error WebMCP attributes are W3C-draft and not yet in React's type defs
                toolname="submit_contact_enquiry"
                tooldescription="Submit a contact enquiry to RestoreAssist (Australia's first Australian-designed CRM for the restoration industry). Routes to the team for human follow-up. For active disaster-recovery claims, use disasterrecovery.com.au instead."
              >
                <div>
                  <label htmlFor="contact-name" className="sr-only">
                    Your Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    name="name"
                    placeholder="Your Name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    disabled={status === "submitting"}
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? "bg-brand-navy/50 border-brand-slate/30 text-brand-cloud placeholder-brand-slate" : "bg-brand-cloud/50 border-brand-slate/20 text-brand-navy placeholder-brand-slate"} focus:outline-none focus:border-brand-bronze transition-colors disabled:opacity-60`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                    // @ts-expect-error WebMCP attribute — W3C draft, not yet in React types
                    toolparamdescription="Full name of the enquirer (first and last name preferred)"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="sr-only">
                    Your Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    name="email"
                    placeholder="Your Email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    disabled={status === "submitting"}
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? "bg-brand-navy/50 border-brand-slate/30 text-brand-cloud placeholder-brand-slate" : "bg-brand-cloud/50 border-brand-slate/20 text-brand-navy placeholder-brand-slate"} focus:outline-none focus:border-brand-bronze transition-colors disabled:opacity-60`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                    // @ts-expect-error WebMCP attribute — W3C draft, not yet in React types
                    toolparamdescription="Business email address where the RestoreAssist team should reply"
                  />
                </div>
                <div>
                  <label htmlFor="contact-message" className="sr-only">
                    Your Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    placeholder="Your Message"
                    rows={5}
                    minLength={10}
                    maxLength={3000}
                    required
                    value={form.message}
                    onChange={handleChange}
                    disabled={status === "submitting"}
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? "bg-brand-navy/50 border-brand-slate/30 text-brand-cloud placeholder-brand-slate" : "bg-brand-cloud/50 border-brand-slate/20 text-brand-navy placeholder-brand-slate"} focus:outline-none focus:border-brand-bronze transition-colors resize-none disabled:opacity-60`}
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                    // @ts-expect-error WebMCP attribute — W3C draft, not yet in React types
                    toolparamdescription="Free-text description of the question, current CRM situation, or trial request (max 3000 chars). Mention business type (sole trader / multi-site firm), team size, and current systems if relevant."
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className={`w-full px-6 py-3 rounded-lg font-medium transition-colors bg-brand-bronze text-brand-cloud hover:bg-brand-bronze/90 disabled:opacity-60 disabled:cursor-not-allowed`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {status === "submitting" ? "Sending…" : "Send Message"}
                </button>

                {status === "success" && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-sm font-medium text-success"
                  >
                    Thanks — your message has been received. We&apos;ll respond
                    within 24 hours.
                  </p>
                )}
                {status === "error" && (
                  <p
                    role="alert"
                    aria-live="assertive"
                    className="text-sm font-medium text-destructive"
                  >
                    {errorMsg}
                  </p>
                )}
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  );
}
