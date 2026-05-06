"use client";

import { useEffect, useState, useRef } from "react";
import { authenticateBiometric, isBiometricAvailable } from "@/lib/auth/biometric";
import { Lock } from "lucide-react";

const STORAGE_KEY = "ra-biometric-lock";
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function BiometricLockScreen() {
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const enabled = localStorage.getItem(STORAGE_KEY) === "true";
    if (!enabled) return;

    const handleResume = async () => {
      const elapsed = backgroundedAt.current
        ? Date.now() - backgroundedAt.current
        : Infinity;
      if (elapsed < IDLE_TIMEOUT_MS) return;
      const available = await isBiometricAvailable();
      if (available) setLocked(true);
    };

    const handlePause = () => {
      backgroundedAt.current = Date.now();
    };

    document.addEventListener("resume", handleResume);
    document.addEventListener("pause", handlePause);
    return () => {
      document.removeEventListener("resume", handleResume);
      document.removeEventListener("pause", handlePause);
    };
  }, []);

  const handleUnlock = async () => {
    setAuthenticating(true);
    const ok = await authenticateBiometric();
    setAuthenticating(false);
    if (ok) setLocked(false);
  };

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#050505] flex flex-col items-center justify-center gap-6">
      <Lock className="w-12 h-12 text-slate-400" />
      <p className="text-slate-300 text-lg font-medium">App Locked</p>
      <button
        onClick={handleUnlock}
        disabled={authenticating}
        className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {authenticating ? "Verifying…" : "Unlock with Face ID"}
      </button>
    </div>
  );
}
