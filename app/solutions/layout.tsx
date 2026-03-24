import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Solutions for Restoration Companies & Insurance Adjusters',
  description: 'RestoreAssist solutions for water damage restoration, disaster recovery, insurance claims, and property damage assessment. Streamline workflows for restoration contractors, loss adjusters, and insurance assessors in Australia.',
  keywords: [
    'water damage restoration solutions',
    'disaster recovery software',
    'insurance claim management',
    'restoration contractor software',
    'loss adjuster tools',
    'property damage assessment',
    'restoration workflow automation',
  ],
  openGraph: {
    title: 'Solutions for Restoration Companies & Insurance Adjusters | Restore Assist',
    description: 'Complete restoration management solutions for contractors, loss adjusters, and insurance professionals.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Restore Assist' }],
  },
  alternates: { canonical: '/solutions' },
}

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
