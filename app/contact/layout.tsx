import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Restore Assist - Australian Restoration Software',
  description: 'Contact RestoreAssist for demos, support, or inquiries about our restoration report software. We help Australian restoration professionals streamline their workflow.',
  keywords: [
    'contact RestoreAssist',
    'restoration software demo',
    'restoration software support',
    'get restoration software',
  ],
  openGraph: {
    title: 'Contact Restore Assist - Australian Restoration Software',
    description: 'Get in touch for demos, support, or inquiries about restoration software.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
