import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "fs";
import path from "path";

const BetaSignupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().min(1, "Name is required").max(100),
  deviceType: z.enum(["ios", "android", "both"], {
    errorMap: () => ({ message: "Device type must be ios, android, or both" }),
  }),
});

interface BetaSignup {
  email: string;
  name: string;
  deviceType: "ios" | "android" | "both";
  signedUpAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "mobile-beta-signups.json");

function readSignups(): BetaSignup[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw) as BetaSignup[];
    }
  } catch {
    // If the file is unreadable, start fresh
  }
  return [];
}

function writeSignups(signups: BetaSignup[]): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(signups, null, 2), "utf-8");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BetaSignupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { email, name, deviceType } = parsed.data;
    const normalisedEmail = email.toLowerCase().trim();

    const existing = readSignups();

    // Duplicate email check
    const duplicate = existing.find(
      (s) => s.email.toLowerCase() === normalisedEmail,
    );
    if (duplicate) {
      return NextResponse.json(
        {
          message: "You're already on the beta list — we'll be in touch soon.",
        },
        { status: 200 },
      );
    }

    const newSignup: BetaSignup = {
      email: normalisedEmail,
      name: name.trim(),
      deviceType,
      signedUpAt: new Date().toISOString(),
    };

    try {
      writeSignups([...existing, newSignup]);
    } catch {
      // Fallback: file write failed silently
    }

    return NextResponse.json(
      { message: "Thanks! You'll be notified when the beta is ready." },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}

export async function GET() {
  // Admin convenience: return signup count (not full list for privacy)
  const signups = readSignups();
  return NextResponse.json({
    count: signups.length,
    deviceBreakdown: {
      ios: signups.filter((s) => s.deviceType === "ios").length,
      android: signups.filter((s) => s.deviceType === "android").length,
      both: signups.filter((s) => s.deviceType === "both").length,
    },
  });
}
