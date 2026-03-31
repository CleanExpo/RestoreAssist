'use client'

/**
 * CapacitorProvider
 *
 * Detects whether the app is running inside a Capacitor native shell (iOS or Android)
 * and exposes native capability flags via the `useCapacitor()` hook.
 *
 * Usage:
 *   const { isNative, platform, hasNativeCamera, hasNativeBluetooth } = useCapacitor()
 *
 * On web browsers all flags are false. On iOS/Android native shells the correct
 * flags are true. This lets components branch between web and native behaviour
 * (e.g. MeterPhotoCapture uses @capacitor/camera instead of <input capture>).
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CapacitorContextValue {
  /** true when running inside iOS/Android Capacitor shell */
  isNative: boolean
  /** 'ios' | 'android' on native, 'web' in browser */
  platform: 'ios' | 'android' | 'web'
  /** true when @capacitor/camera plugin is available */
  hasNativeCamera: boolean
  /**
   * true on iOS native — Web Bluetooth is blocked in Safari/WKWebView
   * so native iOS requires the Capacitor BLE plugin.
   * Android: Web Bluetooth works in the Chromium WebView.
   */
  hasNativeBluetooth: boolean
}

// ── Context ───────────────────────────────────────────────────────────────────

const defaultValue: CapacitorContextValue = {
  isNative: false,
  platform: 'web',
  hasNativeCamera: false,
  hasNativeBluetooth: false,
}

const CapacitorContext = createContext<CapacitorContextValue>(defaultValue)

export const useCapacitor = () => useContext(CapacitorContext)

// ── Provider ──────────────────────────────────────────────────────────────────

export function CapacitorProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<CapacitorContextValue>(defaultValue)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // window.Capacitor is injected by the native shell.
    // In a web browser it is undefined.
    const cap = (window as unknown as { Capacitor?: {
      isNativePlatform: () => boolean
      getPlatform: () => string
    } }).Capacitor

    if (!cap?.isNativePlatform()) return

    const platform = cap.getPlatform() as 'ios' | 'android'

    // Darken status bar on iOS to match the OLED #050505 theme
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Dark }))
      .catch(() => {
        // StatusBar plugin not available — safe to ignore
      })

    setValue({
      isNative: true,
      platform,
      hasNativeCamera: true,
      // iOS Safari/WKWebView blocks Web Bluetooth — use native BLE plugin on iOS
      // Android Chromium WebView supports Web Bluetooth natively
      hasNativeBluetooth: platform === 'ios',
    })
  }, [])

  return (
    <CapacitorContext.Provider value={value}>
      {children}
    </CapacitorContext.Provider>
  )
}
