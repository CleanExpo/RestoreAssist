import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compliance - IICRC S500 & Australian Standards',
  description: 'How RestoreAssist meets IICRC S500, NCC 2022, AS/NZS standards and Australian insurance requirements for restoration reporting and damage assessment.',
  keywords: [
    'IICRC S500 compliance',
    'restoration compliance Australia',
    'NCC 2022 restoration',
    'AS/NZS standards',
    'insurance restoration compliance',
  ],
  openGraph: {
    title: 'Compliance - RestoreAssist',
    description: 'IICRC S500 and Australian compliance for restoration reporting.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/compliance' },
}

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
