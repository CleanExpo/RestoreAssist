import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How It Works - RestoreAssist Restoration Software',
  description: 'Learn how RestoreAssist works: from inspection and scoping to AI-powered reports and cost estimation. Built for Australian restoration contractors and IICRC S500 compliance.',
  keywords: [
    'how restoration software works',
    'restoration report workflow',
    'AI damage assessment process',
    'IICRC S500 software',
    'restoration inspection to report',
  ],
  openGraph: {
    title: 'How It Works - RestoreAssist',
    description: 'From inspection to report: see how RestoreAssist streamlines restoration workflows.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/how-it-works' },
}

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
