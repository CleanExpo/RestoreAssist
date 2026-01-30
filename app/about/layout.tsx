import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us - Transforming Restoration Reporting',
  description: 'Learn about RestoreAssist, the Australian restoration software company revolutionizing water damage assessment and reporting with AI-powered technology and IICRC S500 compliance.',
  keywords: [
    'about RestoreAssist',
    'restoration software company',
    'Australian restoration technology',
    'IICRC software developers',
    'restoration industry innovation',
  ],
  openGraph: {
    title: 'About RestoreAssist - Restoration Software Leaders',
    description: 'Revolutionizing restoration reporting with AI-powered technology and IICRC compliance.',
    type: 'website',
  },
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
