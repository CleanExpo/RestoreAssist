import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compliance Library - IICRC S500 & Standards Reference',
  description: 'Reference library for IICRC S500, NCC 2022, AS/NZS and Australian restoration standards. Built for RestoreAssist compliance workflows.',
  keywords: [
    'IICRC S500 library',
    'restoration standards reference',
    'NCC 2022 restoration',
    'compliance library Australia',
  ],
  openGraph: {
    title: 'Compliance Library - RestoreAssist',
    description: 'IICRC S500 and Australian restoration standards reference.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/compliance-library' },
}

export default function ComplianceLibraryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
