import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    console.log("🟢 [REGISTER] Start registration process")

    const { name, email, password } = await request.json()
    console.log("🟢 [REGISTER] Parsed body - name:", name, "email:", email)

    if (!name || !email || !password) {
      console.log("🔴 [REGISTER] Missing required fields")
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    // Check if user already exists
    console.log("🟢 [REGISTER] Checking if user exists...")
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })
    console.log("🟢 [REGISTER] User exists check complete:", existingUser ? "EXISTS" : "NEW")

    if (existingUser) {
      console.log("🔴 [REGISTER] User already exists")
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    // Hash password
    console.log("🟢 [REGISTER] Hashing password...")
    const hashedPassword = await bcrypt.hash(password, 12)
    console.log("🟢 [REGISTER] Password hashed successfully")

    // Create user with 3 credits and TRIAL status
    console.log("🟢 [REGISTER] Creating user in database...")
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "USER",
        subscriptionStatus: "TRIAL",
        creditsRemaining: 3,
        totalCreditsUsed: 0,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      }
    })
    console.log("🟢 [REGISTER] User created successfully:", user.id)

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json(
      { 
        message: "User created successfully",
        user: userWithoutPassword 
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("🔴 Registration error - Full error object:")
    console.error("Error message:", error?.message)
    console.error("Error code:", error?.code)
    console.error("Error name:", error?.name)
    console.error("Error stack:", error?.stack)
    console.error("Full error:", JSON.stringify(error, null, 2))

    // Check for specific database errors
    if (error.message?.includes("hasPremiumInspectionReports")) {
      console.error("🔴 CRITICAL: Database migration missing - hasPremiumInspectionReports column does not exist")
      console.error("FIX: Run /api/admin/deploy-migrations endpoint or set DIRECT_URL in Vercel environment")
      return NextResponse.json(
        { error: "Database schema is not up to date. Admin action required." },
        { status: 503 }
      )
    }

    if (error.code === "P1000" || error.message?.includes("authentication failed")) {
      console.error("🔴 Database connection error")
      return NextResponse.json(
        { error: "Database connection failed. Please try again later." },
        { status: 503 }
      )
    }

    if (error.code === "P1001") {
      console.error("🔴 Cannot reach database server at:", process.env.DATABASE_URL?.split("@")[1])
      return NextResponse.json(
        { error: "Cannot reach database server. Check database connection." },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
