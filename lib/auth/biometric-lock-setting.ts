"use client";

/**
 * RA-8436: the one owner of the "Require Face ID to unlock" setting.
 *
 * The settings switch writes it and the lock screen reads it at the time of
 * each app event, so a change applies without restarting the app. Kept apart
 * from `lib/auth/biometric.ts` so the settings page does not pull in the
 * native biometric plugin.
 */
export const BIOMETRIC_LOCK_STORAGE_KEY = "ra-biometric-lock";

export function isBiometricLockEnabled(): boolean {
  try {
    return window.localStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setBiometricLockEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(BIOMETRIC_LOCK_STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable (private mode or SSR); the switch stays off.
  }
}
