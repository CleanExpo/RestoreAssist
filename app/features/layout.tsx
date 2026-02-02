import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Features - AI Damage Assessment & IICRC S500 Compliance',
  description: 'Discover RestoreAssist features: AI-powered report generation, IICRC S500 compliance, cost estimation, interactive forms, and real-time collaboration for water damage restoration professionals in Australia.',
  keywords: [
    'restoration software features',
    'AI report generation',
    'IICRC S500 compliance',
    'water damage assessment',
    'cost estimation software',
    'interactive inspection forms',
    'restoration collaboration tools',
  ],
  openGraph: {
    title: 'Features - AI Damage Assessment & IICRC S500 Compliance | Restore Assist',
    description: 'AI-powered report generation, IICRC S500 compliance, and comprehensive restoration tools for Australian professionals.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/features' },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
