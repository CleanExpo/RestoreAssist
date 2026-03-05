import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog - Restoration Industry Insights & Tips',
  description: 'Articles and guides on water damage restoration, IICRC compliance, restoration reporting best practices, and industry news for Australian restoration professionals.',
  keywords: [
    'restoration blog',
    'water damage restoration tips',
    'IICRC compliance articles',
    'restoration industry news',
    'restoration reporting guides',
  ],
  openGraph: {
    title: 'Blog - RestoreAssist',
    description: 'Restoration industry insights, compliance guides, and best practices for Australian professionals.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/blog' },
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
