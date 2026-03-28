import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RestoreAssist - Restoration Report Software',
    short_name: 'RestoreAssist',
    description: 'AI-powered restoration report software for Australian water damage and disaster recovery professionals. IICRC S500 compliant.',
    // Field-first: start directly in the inspection portal, not the marketing home page
    start_url: '/portal/inspections',
    scope: '/',
    display: 'standalone',
    // Portrait lock: one-handed operation per PHYSICAL_UX_REQUIREMENTS.oneHandedOperation
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        // 'maskable' allows the OS to crop/shape the icon for its home screen style
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity', 'utilities'],
    lang: 'en-AU',
    // Shortcuts allow long-press to jump directly to a new inspection
    shortcuts: [
      {
        name: 'New Inspection',
        short_name: 'New',
        description: 'Start a new NIR field inspection',
        url: '/portal/inspections/new',
        icons: [{ src: '/logo.png', sizes: '96x96' }],
      },
    ],
  }
}
