import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Features - AI-Powered Restoration Software',
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
    title: 'Features - AI-Powered Restoration Software | RestoreAssist',
    description: 'AI-powered report generation, IICRC S500 compliance, and comprehensive restoration tools for Australian professionals.',
    type: 'website',
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
