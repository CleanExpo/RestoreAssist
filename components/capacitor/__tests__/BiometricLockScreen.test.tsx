// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: null }),
}));

const authenticateBiometric = vi.fn(async () => true);
vi.mock("@/lib/auth/biometric", () => ({
  isBiometricAvailable: async () => true,
  authenticateBiometric: () => authenticateBiometric(),
}));

import { setBiometricLockEnabled } from "@/lib/auth/biometric-lock-setting";
import { BiometricLockScreen } from "../BiometricLockScreen";

const SIX_MINUTES = 6 * 60 * 1000;

async function backgroundForSixMinutes() {
  await act(async () => {
    document.dispatchEvent(new Event("pause"));
  });
  vi.setSystemTime(Date.now() + SIX_MINUTES);
  await act(async () => {
    document.dispatchEvent(new Event("resume"));
  });
}

// Own in-memory storage: on Node 25+ the runtime's experimental localStorage
// global shadows jsdom's and is undefined without --localstorage-file.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => {
      data.delete(k);
    },
    setItem: (k, v) => {
      data.set(k, String(v));
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  authenticateBiometric.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * RA-8436: the lock screen read the setting once at start, so flipping the
 * switch did nothing until the app was fully closed and reopened.
 */
describe("BiometricLockScreen setting changes without restart", () => {
  it("locks on return after 5 minutes when the switch is turned on after start", async () => {
    render(<BiometricLockScreen />);
    await act(async () => {});
    expect(screen.queryByText("Unlock with Face ID")).not.toBeInTheDocument();

    setBiometricLockEnabled(true);
    await backgroundForSixMinutes();

    expect(screen.getByText("Unlock with Face ID")).toBeInTheDocument();
  });

  it("stops locking when the switch is turned off after start", async () => {
    setBiometricLockEnabled(true);
    render(<BiometricLockScreen />);
    await act(async () => {});
    // Cold launch with the setting on locks; unlock first.
    expect(screen.getByText("Unlock with Face ID")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("Unlock with Face ID"));
    });
    expect(screen.queryByText("Unlock with Face ID")).not.toBeInTheDocument();

    setBiometricLockEnabled(false);
    await backgroundForSixMinutes();

    expect(screen.queryByText("Unlock with Face ID")).not.toBeInTheDocument();
  });

  it("does not lock on a return within 5 minutes", async () => {
    render(<BiometricLockScreen />);
    await act(async () => {});
    setBiometricLockEnabled(true);
    await act(async () => {
      document.dispatchEvent(new Event("pause"));
    });
    vi.setSystemTime(Date.now() + 60 * 1000);
    await act(async () => {
      document.dispatchEvent(new Event("resume"));
    });
    expect(screen.queryByText("Unlock with Face ID")).not.toBeInTheDocument();
  });
});
