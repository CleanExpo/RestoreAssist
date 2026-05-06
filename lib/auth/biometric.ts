"use client";

import {
  BiometricAuth,
  BiometryErrorType,
} from "@aparajita/capacitor-biometric-auth";

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const { isAvailable } = await BiometricAuth.checkBiometry();
    return isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    await BiometricAuth.authenticate({
      reason: "Verify your identity to continue",
      cancelTitle: "Use Password",
      allowDeviceCredential: true,
    });
    return true;
  } catch (err: unknown) {
    // User cancelled — not an error worth logging
    const code = (err as { code?: BiometryErrorType })?.code;
    if (code === BiometryErrorType.userCancel) return false;
    return false;
  }
}
