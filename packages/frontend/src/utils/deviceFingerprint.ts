import { sha256 } from 'js-sha256';

// =====================================================
// Types & Interfaces
// =====================================================

export interface DeviceInfo {
  userAgent: string;
  language: string;
  languages: readonly string[];
  platform: string;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  timezoneOffset: number;
  hardwareConcurrency: number;
  deviceMemory?: number;
  cookiesEnabled: boolean;
  doNotTrack: string | null;
  canvasFingerprint: string;
  webGLVendor?: string;
  webGLRenderer?: string;
  touchSupport: boolean;
  maxTouchPoints: number;
  audioFingerprint?: string;
}

export interface FingerprintResult {
  fingerprintHash: string;
  deviceData: DeviceInfo;
}

// =====================================================
// Device Fingerprinting Utility
// =====================================================

class DeviceFingerprinter {
  /**
   * Generate canvas fingerprint
   */
  private getCanvasFingerprint(): string {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'unavailable';

      canvas.width = 200;
      canvas.height = 50;

      // Draw text with various styles
      ctx.textBaseline = 'top';
      ctx.font = '14px "Arial"';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('RestoreAssist 🔐', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('RestoreAssist 🔐', 4, 17);

      // Get canvas data
      const dataUrl = canvas.toDataURL();
      return sha256(dataUrl);
    } catch (error) {
      return 'error';
    }
  }

  /**
   * Get WebGL fingerprint
   */
  private getWebGLFingerprint(): { vendor?: string; renderer?: string } {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return {};

      const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return {};

      return {
        vendor: (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Get audio fingerprint
   */
  private async getAudioFingerprint(): Promise<string> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0; // Mute
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10000;

      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      return new Promise((resolve) => {
        scriptProcessor.onaudioprocess = (event) => {
          const output = event.outputBuffer.getChannelData(0);
          const hash = sha256(Array.from(output.slice(0, 100)).join(','));

          oscillator.stop();
          scriptProcessor.disconnect();
          gainNode.disconnect();
          analyser.disconnect();
          oscillator.disconnect();
          audioContext.close();

          resolve(hash);
        };

        oscillator.start(0);
      });
    } catch (error) {
      return 'unavailable';
    }
  }

  /**
   * Collect all device information
   */
  private async collectDeviceInfo(): Promise<DeviceInfo> {
    const nav = window.navigator;
    const screen = window.screen;

    const webGLInfo = this.getWebGLFingerprint();
    const canvasFingerprint = this.getCanvasFingerprint();
    const audioFingerprint = await this.getAudioFingerprint();

    return {
      userAgent: nav.userAgent,
      language: nav.language,
      languages: nav.languages,
      platform: nav.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      hardwareConcurrency: nav.hardwareConcurrency || 0,
      deviceMemory: (nav as any).deviceMemory,
      cookiesEnabled: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack,
      canvasFingerprint,
      webGLVendor: webGLInfo.vendor,
      webGLRenderer: webGLInfo.renderer,
      touchSupport: 'ontouchstart' in window,
      maxTouchPoints: nav.maxTouchPoints || 0,
      audioFingerprint,
    };
  }

  /**
   * Generate a unique fingerprint hash from device information
   */
  private generateFingerprint(deviceInfo: DeviceInfo): string {
    // Combine all device characteristics into a string
    const fingerprintString = [
      deviceInfo.userAgent,
      deviceInfo.language,
      deviceInfo.languages.join(','),
      deviceInfo.platform,
      deviceInfo.screenResolution,
      deviceInfo.colorDepth,
      deviceInfo.timezone,
      deviceInfo.timezoneOffset,
      deviceInfo.hardwareConcurrency,
      deviceInfo.deviceMemory,
      deviceInfo.cookiesEnabled,
      deviceInfo.doNotTrack,
      deviceInfo.canvasFingerprint,
      deviceInfo.webGLVendor,
      deviceInfo.webGLRenderer,
      deviceInfo.touchSupport,
      deviceInfo.maxTouchPoints,
      deviceInfo.audioFingerprint,
    ].join('|');

    // Generate SHA-256 hash
    return sha256(fingerprintString);
  }

  /**
   * Generate complete device fingerprint
   */
  async generateDeviceFingerprint(): Promise<FingerprintResult> {
    const deviceData = await this.collectDeviceInfo();
    const fingerprintHash = this.generateFingerprint(deviceData);

    return {
      fingerprintHash,
      deviceData,
    };
  }
}

// Singleton instance
const deviceFingerprinter = new DeviceFingerprinter();

/**
 * Public API: Generate device fingerprint
 */
export async function generateDeviceFingerprint(): Promise<FingerprintResult> {
  return deviceFingerprinter.generateDeviceFingerprint();
}

/**
 * Public API: Get fingerprint hash only (faster)
 */
export async function getFingerprintHash(): Promise<string> {
  const result = await deviceFingerprinter.generateDeviceFingerprint();
  return result.fingerprintHash;
}
