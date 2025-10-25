import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find customer
    const customers = await stripe.customers.list({
      email: session.user.email!,
      limit: 1,
    })

    if (customers.data.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    const customer = customers.data[0]
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 })
    }

    const subscription = subscriptions.data[0]

    // Cancel subscription at period end
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error canceling subscription:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
