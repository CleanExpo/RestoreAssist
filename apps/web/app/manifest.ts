import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RestoreAssist',
    short_name: 'RestoreAssist',
    description:
      'Compliance platform for disaster restoration contractors',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    lang: 'en-AU',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'New Job',
        short_name: 'New Job',
        url: '/dashboard/reports/new',
        icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }],
      },
      {
        name: 'Compliance',
        short_name: 'Compliance',
        url: '/compliance',
        icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }],
      },
    ],
    screenshots: [],
  }
}
