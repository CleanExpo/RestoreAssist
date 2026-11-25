"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  MarketingShell,
  MarketingPageHero,
} from "@/components/landing/home";
import {
  fadeUp,
  staggerContainer,
  FONT_DISPLAY,
  CONTAINER,
  SECTION_PAD,
  VIEWPORT,
  SURFACE,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

export default function ResourcesClientPage() {
  const reduce = useLandingReduceMotion();

  const resourceCategories: {
    category: string;
    items: {
      title: string;
      description: string;
      link: string;
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
          title: "Compliance Library",
          description: "The standards restoration work is measured against",
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
      ],
    },
  ];

  return (
    <MarketingShell>
      <MarketingPageHero
        eyebrow="Library"
        title="Resources"
        description="Everything you need to get the most out of RestoreAssist."
      />

      <section className={`bg-white border-t border-slate-200/90 ${SECTION_PAD}`}>
        <div className={CONTAINER}>
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="grid gap-6 md:grid-cols-3 md:gap-8"
          >
            {resourceCategories.map((category) => (
              <motion.div
                key={category.category}
                variants={fadeUp}
                className={`${SURFACE} p-6 sm:p-7`}
              >
                <h2
                  className={`${FONT_DISPLAY} text-lg font-semibold tracking-tight text-brand-navy sm:text-xl`}
                >
                  {category.category}
                </h2>
                <ul className="mt-5 space-y-2">
                  {category.items.map((item) => {
                    const inner = (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className={`${FONT_DISPLAY} text-[15px] font-semibold text-brand-navy`}
                          >
                            {item.title}
                          </h3>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                          {item.description}
                        </p>
                      </>
                    );

                    // Only shipped resources are listed (RA-8403): every
                    // tile links somewhere real; nothing is listed before it ships.
                    return (
                      <li key={item.title}>
                        <Link
                          href={item.link}
                          className="block rounded-xl p-3 transition-colors hover:bg-[#F3F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-harbour/50"
                        >
                          {inner}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </MarketingShell>
  );
}
