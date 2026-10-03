import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// RA-7872: iOS terminates the app the moment it asks for a protected
// resource whose purpose string is missing from Info.plist. Voice notes call
// getUserMedia (microphone) and the moisture-meter pairing uses the
// @capacitor-community/bluetooth-le plugin (Bluetooth on iOS 13+).

const plist = readFileSync(
  resolve(__dirname, "../../ios/App/App/Info.plist"),
  "utf8",
);

function usageString(key: string): string | null {
  const match = plist.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`),
  );
  return match ? match[1].trim() : null;
}

describe("iOS Info.plist purpose strings (RA-7872)", () => {
  it.each(["NSMicrophoneUsageDescription", "NSBluetoothAlwaysUsageDescription"])(
    "declares a non-empty %s",
    (key) => {
      const value = usageString(key);
      expect(value, `${key} missing from Info.plist`).not.toBeNull();
      expect(value!.length).toBeGreaterThan(20);
    },
  );
});
