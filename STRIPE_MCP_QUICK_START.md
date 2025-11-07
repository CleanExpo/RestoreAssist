# Stripe MCP Quick Start Guide for RestoreAssist

**Fast reference for using Stripe MCP in Claude Code**

---

## ⚡ Quick Setup Checklist

- [ ] Rotate Stripe live key (replace exposed key)
- [ ] Update Claude config with new key
- [ ] Restart Claude Code
- [ ] Test with: "What's my Stripe account info?"

---

## 💬 Natural Language Commands You Can Use

### Customer Management

```
"Create a Stripe customer for user@example.com named John Doe"
"Show me all customers created in the last 7 days"
"Update customer cus_abc123 email to newemail@example.com"
"Find customer by email user@example.com"
"Delete test customer cus_test123"
```

### Product & Pricing Setup

```
"Create a product called 'RestoreAssist Professional' priced at $49/month"
"List all my active products"
"Create a $299 yearly price for product prod_abc123"
"Show me all recurring prices"
```

### Subscription Management

```
"Subscribe customer cus_abc123 to price_xyz789"
"Create a subscription with 14-day trial for customer"
"Show all active subscriptions"
"Cancel subscription sub_abc123 at the end of the billing period"
"Upgrade customer to annual plan"
```

### Payment Processing

```
"Create a payment link for $99 one-time payment"
"Generate a checkout link for the Professional Plan"
"Show me payment intents from the last 24 hours"
"Process a refund for payment pi_abc123"
```

### Invoicing

```
"Create an invoice for customer cus_abc123"
"Add a $150 line item for consulting services"
"Finalize and send the invoice"
"Show me all unpaid invoices"
"List invoices due this week"
```

### Account & Reporting

```
"What's my Stripe balance?"
"Show my account information"
"List all disputes from this month"
"Search for transactions over $100"
```

### Documentation Lookup

```
"How do I implement a free trial period?"
"What's the best way to handle failed payments?"
"Show me documentation about webhooks"
"How do I set up metered billing?"
```

---

## 🎯 Common RestoreAssist Workflows

### Workflow 1: New Customer Onboarding

```
You: "I need to set up a new customer for RestoreAssist Professional"

Claude: I'll help you set that up. Could you provide:
- Customer email
- Customer name
- Subscription plan (Monthly or Annual?)

You: "Email is john@business.com, name John Smith, monthly plan"

Claude: [Creates customer, subscribes to monthly plan, returns details]
```

### Workflow 2: Testing Subscription Flow

```
You: "Create a test subscription flow for the Professional plan with 14-day trial"

Claude: [Creates test customer, creates subscription with trial period, provides test details]
```

### Workflow 3: Checking Revenue

```
You: "Show me my Stripe balance and list all payments from this month"

Claude: [Retrieves balance, lists payment intents, provides summary]
```

### Workflow 4: Handling Customer Request

```
You: "Customer wants to cancel their subscription but keep access until end of period"

Claude: "I'll need the customer email or subscription ID"

You: "john@business.com"

Claude: [Finds subscription, cancels at period end, confirms]
```

### Workflow 5: Creating One-Time Payment

```
You: "Create a payment link for a one-time setup fee of $199"

Claude: [Creates payment link, returns shareable URL]
```

---

## 🔧 Development Tasks

### Setting Up Test Data

```
"Create 5 test customers with random names"
"Create test subscriptions for monthly and annual plans"
"Generate test payment links for all pricing tiers"
```

### Debugging Issues

```
"Show me failed payment intents from today"
"List all subscriptions that are past due"
"Find customer by incomplete subscription"
```

### Cleanup Operations

```
"Delete all test customers (emails containing @test.com)"
"Cancel all subscriptions for test customers"
"Remove test products"
```

---

## 🚨 When to Use MCP vs Code

### ✅ Use Stripe MCP For:

- Quick administrative tasks
- Testing and development
- Exploring Stripe features
- Debugging payment issues
- Creating test data
- Checking account status
- Looking up documentation
- One-off operations

### 💻 Use Direct API Code For:

- Production checkout flows
- Webhook event handling
- Custom UI components
- Automated background jobs
- Complex business logic
- Performance-critical operations
- Multi-step transactions
- Features requiring custom validation

---

## 🎓 Learning Path

### Day 1: Basic Operations
```
1. "What's my Stripe account info?"
2. "Create a test customer"
3. "List all products"
4. "Create a simple payment link"
```

### Day 2: Customer Management
```
1. "Create 3 customers with different emails"
2. "Search for customer by email"
3. "Update customer metadata"
```

### Day 3: Subscriptions
```
1. "Create a subscription product"
2. "Add monthly and annual pricing"
3. "Subscribe a test customer"
4. "Cancel subscription"
```

### Day 4: Advanced Operations
```
1. "Create invoice with multiple line items"
2. "Set up subscription with trial"
3. "Handle refund scenarios"
4. "Search documentation for complex features"
```

---

## 📝 Useful Patterns

### Pattern 1: Bulk Operations
```
"For each customer in the last 30 days, check their subscription status
and list any that are past due"
```

### Pattern 2: Conditional Logic
```
"If subscription is canceled, show cancellation reason.
If active, show next billing date"
```

### Pattern 3: Data Export
```
"List all customers with active subscriptions and export their
email, plan name, and billing date to a table"
```

### Pattern 4: Verification
```
"Double-check that customer cus_abc123 has an active subscription
before I send them premium feature access"
```

---

## 🔐 Security Reminders

**Always:**
- ✅ Use test mode (`sk_test_`) for development
- ✅ Verify customer identity before refunds
- ✅ Review operations before execution
- ✅ Use restricted API keys

**Never:**
- ❌ Share API keys in code or commits
- ❌ Use live mode for testing
- ❌ Process refunds without verification
- ❌ Expose customer data in logs

---

## 🐛 Troubleshooting

**MCP not responding?**
- Restart Claude Code
- Check Claude config syntax
- Verify API key is valid
- Check internet connection

**Tools not available?**
- Ensure you used `--tools=all` flag
- Or specify exact tools needed
- Restart after config changes

**Permission errors?**
- Check API key has required permissions
- Use restricted key with correct scopes
- Verify you're using correct key type (test/live)

**Rate limits?**
- Stripe has generous rate limits
- Wait a moment and retry
- Use batch operations when possible

---

## 📞 Getting Help

**Stripe Documentation:**
```
"Search Stripe documentation for [your question]"
```

**MCP-Specific Help:**
- Stripe MCP Docs: https://docs.stripe.com/mcp
- GitHub Issues: https://github.com/stripe/agent-toolkit/issues

**RestoreAssist-Specific:**
- Check your existing Stripe integration code
- Review webhook implementations
- Test against your product/price IDs

---

## 🎉 You're Ready!

Once you rotate your Stripe key, you'll have instant access to powerful payment operations through natural language!

**Next steps:**
1. Get new Stripe key from dashboard
2. Share it with me to update config
3. Restart Claude Code
4. Try: "What's my Stripe account info?"

That's it! You're ready to manage Stripe operations 10x faster! 🚀
