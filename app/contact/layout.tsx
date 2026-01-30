import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us - Get in Touch',
  description: 'Contact RestoreAssist for demos, support, or inquiries about our restoration report software. We help Australian restoration professionals streamline their workflow.',
  keywords: [
    'contact RestoreAssist',
    'restoration software demo',
    'restoration software support',
    'get restoration software',
  ],
  openGraph: {
    title: 'Contact RestoreAssist',
    description: 'Get in touch for demos, support, or inquiries about restoration software.',
    type: 'website',
  },
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
