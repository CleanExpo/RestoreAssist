import type { CapacitorConfig } from '@capacitor/cli'

/**
 * CET (Client Education Terminal) Capacitor config.
 *
 * Separate app from the RestoreAssist field app:
 *   Field app:  com.restoreassist.app   (server-hosted WebView)
 *   CET app:    com.restoreassist.cet   (static Vite SPA, offline-first)
 *
 * The CET app is a pure React SPA (Vite build) with pre-downloaded videos
 * stored in Capacitor Filesystem. It does NOT load from a server URL —
 * it serves the local dist/ folder so it works fully offline.
 *
 * App Store setup:
 *   - Separate App Store listing: "RestoreAssist CET"
 *   - Enterprise distribution (internal — not public App Store) may simplify this
 */

const config: CapacitorConfig = {
  appId: 'com.restoreassist.cet',
  appName: 'RestoreAssist CET',
  webDir: 'dist',  // Vite build output — served locally (offline-capable)
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#050505',
      showSpinner: true,
      spinnerColor: '#00F5FF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
  },
  ios: {
    backgroundColor: '#050505',
    scrollEnabled: false,  // Kiosk — no scroll bounce
    contentInset: 'never',
  },
  android: {
    backgroundColor: '#050505',
    allowMixedContent: false,
  },
}

export default config
