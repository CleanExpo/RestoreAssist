import { Metadata } from "next";
import { FAQPageSchema } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "FAQ - Restore Assist Questions & Answers",
  description:
    "Get answers to common questions about RestoreAssist restoration software, IICRC S500 alignment, pricing, features, integrations, and implementation for Australian restoration businesses.",
  keywords: [
    "restoration software FAQ",
    "IICRC software questions",
    "restoration reporting help",
    "water damage software answers",
  ],
  openGraph: {
    title: "FAQ - Restore Assist Questions & Answers",
    description:
      "Common questions about restoration software, standards alignment, and features.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/faq" },
};

const faqData = [
  {
    question: "What is RestoreAssist?",
    answer:
      "RestoreAssist is an AI-assisted damage assessment platform used by Australian restoration professionals. Restorers use it to create accurate, transparent, and auditable restoration reports with built-in alignment to industry standards.",
  },
  {
    question: "How does the AI assistance work?",
    answer:
      "Restorers capture site data including photos, measurements, and damage details on site. The platform's AI assists by identifying damage patterns, surfacing relevant standards, and drafting scope of work documents that the restorer reviews and approves before issuing.",
  },
  {
    question: "What standards does RestoreAssist align with?",
    answer:
      "RestoreAssist aligns with IICRC S500, NCC 2022, AS/NZS standards, and the requirements of major Australian insurance providers. Restorers can review their reports against these standards within the platform before submission.",
  },
  {
    question: "Can I export reports?",
    answer:
      "Yes, you can export reports in both PDF and Excel formats. Reports are formatted to meet insurance industry requirements and are ready for submission.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes, all plans include a 30-day free trial with unlimited reports and quick fill. Add your API key in Integrations to get started.",
  },
  {
    question: "What happens after my free trial ends?",
    answer:
      "After your free trial ends, you'll need to select a paid plan to continue using RestoreAssist. Your data will be preserved and you can continue from where you left off.",
  },
  {
    question: "Do you offer training and support?",
    answer:
      "Yes, we offer comprehensive training and onboarding for Enterprise customers. All plans include email support, with priority support available for Professional and Enterprise plans.",
  },
  {
    question: "Can I integrate RestoreAssist with other systems?",
    answer:
      "Enterprise plans include custom integrations. Our API documentation is available for developers to integrate RestoreAssist with existing systems and workflows.",
  },
];

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FAQPageSchema questions={faqData} />
      {children}
    </>
  );
}
