import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help & Support - RestoreAssist',
  description: 'Get help with RestoreAssist: FAQs, guides, and support for restoration report software. Australian restoration professionals.',
  keywords: [
    'RestoreAssist help',
    'restoration software support',
    'restoration report help',
    'software documentation',
  ],
  openGraph: {
    title: 'Help & Support - RestoreAssist',
    description: 'FAQs, guides, and support for RestoreAssist restoration software.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/help' },
}

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
