import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Resources - Restoration Guides & Documentation',
  description: 'Guides, templates, and documentation for restoration professionals: insurance restoration documentation requirements, IICRC standards, and RestoreAssist best practices.',
  keywords: [
    'restoration resources',
    'insurance restoration documentation',
    'IICRC documentation',
    'restoration guides',
    'restoration templates Australia',
  ],
  openGraph: {
    title: 'Resources - RestoreAssist',
    description: 'Guides and documentation for restoration professionals and insurance documentation.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/resources' },
}

export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
