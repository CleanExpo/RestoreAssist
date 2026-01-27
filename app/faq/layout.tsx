import { Metadata } from 'next'

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
  },
}

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
