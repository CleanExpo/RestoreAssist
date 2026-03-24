import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing - Restoration Report Software Plans Australia',
  description: 'RestoreAssist pricing plans starting from affordable monthly subscriptions. Choose the right plan for your restoration business with features like unlimited reports, IICRC compliance, and AI-powered assessments.',
  keywords: [
    'restoration software pricing',
    'restoration report software cost',
    'IICRC software pricing',
    'water damage software plans',
    'restoration business software',
    'affordable restoration tools',
  ],
  openGraph: {
    title: 'Pricing - Restoration Report Software Plans Australia | Restore Assist',
    description: 'Affordable pricing plans for restoration professionals. Unlimited reports, IICRC compliance included.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/pricing' },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
