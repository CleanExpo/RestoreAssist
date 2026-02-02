import { Metadata } from 'next'
import { FAQPageSchema } from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: 'FAQ - Frequently Asked Questions',
  description: 'Get answers to common questions about RestoreAssist restoration software, IICRC compliance, pricing, features, integrations, and implementation for Australian restoration businesses.',
  keywords: [
    'restoration software FAQ',
    'IICRC software questions',
    'restoration reporting help',
    'water damage software answers',
  ],
  openGraph: {
    title: 'FAQ - RestoreAssist',
    description: 'Common questions about restoration software, compliance, and features.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/faq' },
}

const faqData = [
  {
    question: "What is RestoreAssist?",
    answer: "RestoreAssist is an AI-powered damage assessment platform designed for Australian restoration professionals. It helps you create accurate, transparent, and auditable restoration reports with compliance built-in."
  },
  {
    question: "How does the AI assessment work?",
    answer: "Our AI analyzes captured site data including photos, measurements, and damage details to identify damage patterns, compliance requirements, and generate detailed scope of work documents automatically."
  },
  {
    question: "What compliance standards does RestoreAssist support?",
    answer: "RestoreAssist supports IICRC S500, NCC 2022, AS/NZS standards, and meets requirements of major Australian insurance providers. All assessments are automatically checked for compliance."
  },
  {
    question: "Can I export reports?",
    answer: "Yes, you can export reports in both PDF and Excel formats. Reports are formatted to meet insurance industry requirements and are ready for submission."
  },
  {
    question: "Is there a free trial?",
    answer: "Yes, all plans include a 14-day free trial. You can explore all features without any commitment during this period."
  },
  {
    question: "What happens after my free trial ends?",
    answer: "After your free trial ends, you'll need to select a paid plan to continue using RestoreAssist. Your data will be preserved and you can continue from where you left off."
  },
  {
    question: "Do you offer training and support?",
    answer: "Yes, we offer comprehensive training and onboarding for Enterprise customers. All plans include email support, with priority support available for Professional and Enterprise plans."
  },
  {
    question: "Can I integrate RestoreAssist with other systems?",
    answer: "Enterprise plans include custom integrations. Our API documentation is available for developers to integrate RestoreAssist with existing systems and workflows."
  }
]

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <FAQPageSchema questions={faqData} />
      {children}
    </>
  )
}
