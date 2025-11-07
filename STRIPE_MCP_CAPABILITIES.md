# Stripe MCP Integration - Complete Capabilities Guide

**Date:** 2025-11-07
**Current Configuration:** `@stripe/mcp` via Claude Code MCP

---

## Overview

Your RestoreAssist project already has the **official Stripe MCP server** configured! This powerful integration allows you to interact with Stripe's entire API through natural language commands in Claude Code.

**Current Setup (from your Claude config):**
```json
"stripe": {
  "command": "npx",
  "args": [
    "-y",
    "@stripe/mcp",
    "--api-key",
    "sk_live_51SK3Z3BY5KEPMwxde..."
  ]
}
```

**Status:** ⚠️ Using OLD exposed API key - needs rotation

---

## What You Can Do With Stripe MCP

### 🎯 Complete List of Available Tools (23 Total)

#### Customer Management
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `create_customer` | Create new customer profiles | "Create a customer for john@example.com" |
| `list_customers` | Retrieve customer lists with filters | "Show me all customers created this month" |
| `update_customer` | Modify customer details | "Update customer email address" |
| `delete_customer` | Remove customer records | "Delete test customer" |

#### Product & Pricing Management
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `create_product` | Define new products/services | "Create a product called 'Premium Plan'" |
| `list_products` | View all products | "Show me all active products" |
| `create_price` | Attach pricing to products | "Create a $99/month price for Premium Plan" |
| `list_prices` | View pricing configurations | "List all recurring prices" |
| `update_price` | Modify price metadata | "Update price nickname" |

#### Subscription Management
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `create_subscription` | Start recurring billing | "Create a monthly subscription for customer" |
| `list_subscriptions` | View all subscriptions | "Show active subscriptions" |
| `update_subscription` | Modify subscription details | "Upgrade customer to annual plan" |
| `cancel_subscription` | End recurring billing | "Cancel subscription at period end" |

#### Payment Processing
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `create_payment_link` | Generate payment URLs | "Create a payment link for $99" |
| `list_payment_intents` | View payment attempts | "Show recent payment intents" |
| `create_refund` | Process refunds | "Refund last payment" |

#### Invoicing
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `create_invoice` | Generate invoices | "Create invoice for customer services" |
| `finalize_invoice` | Send invoices to customers | "Finalize and send invoice" |
| `list_invoices` | View billing history | "Show unpaid invoices" |

#### Financial Operations
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `retrieve_balance` | Check account balance | "What's my Stripe balance?" |
| `list_disputes` | View chargebacks | "Show recent disputes" |
| `update_dispute` | Respond to disputes | "Submit evidence for dispute" |

#### Account & Search
| Tool | Purpose | Example Use |
|------|---------|-------------|
| `get_stripe_account_info` | View account details | "Show my Stripe account info" |
| `search_stripe_resources` | Find Stripe objects | "Search for customer by email" |
| `search_stripe_documentation` | Query Stripe docs | "How do I create a subscription with trial?" |

---

## 🚀 How to Use Stripe MCP in Claude Code

Once you've rotated your Stripe key and restarted Claude Code, you can use natural language to perform Stripe operations:

### Example Conversations:

**Creating a Customer:**
```
You: "Create a Stripe customer for jane.doe@example.com with name Jane Doe"
Claude: [Uses create_customer tool]
```

**Setting Up Subscriptions:**
```
You: "Create a product called 'Professional Plan' with a $49/month price"
Claude: [Uses create_product and create_price tools]

You: "Subscribe customer cus_abc123 to this plan"
Claude: [Uses create_subscription tool]
```

**Checking Balance:**
```
You: "What's my Stripe balance?"
Claude: [Uses retrieve_balance tool]
```

**Searching Documentation:**
```
You: "How do I handle failed payments in Stripe?"
Claude: [Uses search_stripe_documentation tool]
```

---

## 🔧 Advanced Configuration Options

### Using Specific Tools Only
If you want to limit which operations are available (security best practice):

```json
"stripe": {
  "command": "npx",
  "args": [
    "-y",
    "@stripe/mcp",
    "--tools=customers.create,customers.read,subscriptions.create,subscriptions.cancel",
    "--api-key",
    "YOUR_NEW_STRIPE_KEY"
  ]
}
```

### Connected Accounts (Stripe Connect)
For platforms managing payments for others:

```json
"stripe": {
  "command": "npx",
  "args": [
    "-y",
    "@stripe/mcp",
    "--tools=all",
    "--api-key",
    "YOUR_STRIPE_KEY",
    "--stripe-account",
    "acct_CONNECTED_ACCOUNT_ID"
  ]
}
```

### OAuth Authentication (Most Secure)
Instead of API keys, use OAuth:

```bash
claude mcp add --transport http stripe https://mcp.stripe.com
```

This provides:
- Granular permissions
- User-based authorization
- Admin-only installation
- Manageable sessions through Dashboard

---

## 🔐 Security Best Practices

### 1. Use Restricted API Keys
Create a restricted key that only has permissions for operations your AI agent needs:

**Recommended Permissions:**
- ✅ Customers: Read + Write
- ✅ Products: Read
- ✅ Prices: Read
- ✅ Subscriptions: Read + Write
- ✅ Payment Links: Write
- ❌ Refunds: Require approval
- ❌ Disputes: Require approval
- ❌ Balance: Read only

**How to Create:**
1. Go to https://dashboard.stripe.com/apikeys
2. Click "Create restricted key"
3. Select only required permissions
4. Name it "Claude Code MCP - RestoreAssist"
5. Use this instead of your full secret key

### 2. Enable Human Confirmation
Configure Claude Code to ask for confirmation before executing Stripe operations:

In your workflow, always review Stripe operations before execution, especially:
- Creating subscriptions
- Processing refunds
- Finalizing invoices
- Canceling subscriptions

### 3. Monitor API Usage
- Check Stripe Dashboard regularly for unexpected API calls
- Review logs for unusual patterns
- Set up alerts for large transactions

---

## 🎯 Practical Use Cases for RestoreAssist

### 1. Customer Onboarding Automation
```
"When a new user signs up for RestoreAssist, create a Stripe customer
with their email and subscribe them to the trial plan"
```

### 2. Subscription Management
```
"Show me all customers whose subscriptions are ending this month"
"Upgrade customer to annual plan with 20% discount"
"Cancel all test subscriptions"
```

### 3. Invoice Generation
```
"Create an invoice for customer ABC for 3 hours of consulting at $150/hour"
"List all unpaid invoices from last month"
```

### 4. Payment Link Creation
```
"Create a payment link for the Professional Plan at $49/month"
"Generate a one-time payment link for $299"
```

### 5. Financial Reporting
```
"What's my current Stripe balance?"
"Show me all refunds from last week"
"List recent disputes"
```

### 6. Documentation Lookup
```
"How do I implement a 14-day trial period?"
"What's the best way to handle failed subscription payments?"
"Show me how to set up webhooks for subscription events"
```

---

## 🆚 Comparison: MCP vs Direct API Integration

| Feature | Stripe MCP | Direct API Code |
|---------|------------|-----------------|
| **Ease of Use** | Natural language | Write code |
| **Learning Curve** | Minimal | Steep (API docs) |
| **Speed** | Instant | Hours of coding |
| **Flexibility** | High (23 tools) | Unlimited |
| **Error Handling** | Automatic | Manual |
| **Documentation** | Built-in search | External docs |
| **Best For** | Quick operations, testing, management | Complex workflows, production features |

---

## 📊 Integration with Your RestoreAssist Codebase

### Current Stripe Implementation
Your codebase likely has Stripe integrated in:
- `/src/lib/stripe.ts` or similar - Stripe client initialization
- `/src/app/api/stripe/*` - Stripe webhooks and API routes
- Payment components for checkout flows

### How MCP Complements Your Code

**MCP is best for:**
- 🔧 Testing subscription flows during development
- 🎯 Creating test customers and products
- 📊 Checking account status and balances
- 🐛 Debugging payment issues
- 📖 Looking up Stripe documentation
- ⚡ Quick administrative tasks

**Direct API code is best for:**
- 🏗️ Production checkout flows
- 🔄 Webhook event handling
- 🎨 Custom UI integrations
- 🔐 Complex payment logic
- ⚙️ Automated workflows

**Together they provide:** The speed of MCP for development + the power of code for production.

---

## 🛠️ Next Steps to Activate Stripe MCP

### 1. Rotate Your Stripe Key ⚠️ CRITICAL
Your current key in Claude config is exposed and needs rotation:

1. Go to: https://dashboard.stripe.com/apikeys
2. Find the key ending in `2wiQg3Ue`
3. Click "Roll key" or create new restricted key
4. Copy the new key

### 2. Update Claude Config
Once you have the new key, I'll update line 143 of your Claude config with:
```json
"--api-key",
"sk_live_YOUR_NEW_KEY"
```

### 3. Restart Claude Code
Close and reopen Claude Code to load the new credentials.

### 4. Test the Integration
Try these commands:
```
"What's my Stripe account info?"
"List all my products"
"Create a test customer"
```

---

## 📚 Resources

**Official Documentation:**
- Stripe MCP Docs: https://docs.stripe.com/mcp
- Agent Toolkit: https://github.com/stripe/agent-toolkit
- Building with LLMs: https://docs.stripe.com/building-with-llms

**Your Configuration File:**
- `C:\Users\Disaster Recovery 4\AppData\Roaming\Claude\claude_desktop_config.json` (line 137-145)

**Package:**
- NPM: `@stripe/mcp`
- Remote Server: `https://mcp.stripe.com`

---

## ❓ Common Questions

**Q: Can I use test mode instead of live mode?**
A: Yes! Use `sk_test_` keys instead of `sk_live_` keys for testing.

**Q: Will this cost me money?**
A: MCP operations that create customers, products, or subscriptions in test mode are free. In live mode, only successful payments incur fees.

**Q: Can I undo operations?**
A: Most operations can be reversed (cancel subscriptions, delete customers, refund payments). However, some actions like finalizing invoices are permanent.

**Q: Is this secure?**
A: Yes, if you:
- Use restricted API keys
- Rotate exposed credentials
- Enable human confirmation for critical operations
- Monitor your Stripe Dashboard

**Q: Can other MCP servers access my Stripe data?**
A: No, MCP servers are isolated. Only the Stripe MCP server can access Stripe APIs using your key.

---

## 🎉 Summary

You have access to **23 powerful Stripe tools** through natural language in Claude Code!

**Current Status:**
- ✅ Stripe MCP server configured
- ⚠️ API key needs rotation (exposed in git)
- ⏳ Waiting for new key to activate

**Once Activated, You Can:**
- Manage customers, products, and subscriptions
- Process payments and refunds
- Generate invoices and payment links
- Check balances and disputes
- Search Stripe documentation
- Perform complex operations in seconds instead of hours

**Next Action:**
Rotate your Stripe live key and provide it to me so I can update your Claude config!
