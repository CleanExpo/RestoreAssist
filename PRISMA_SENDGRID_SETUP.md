# Prisma + SendGrid MCP Setup Guide

**Date**: October 20, 2025
**Status**: Ready for Configuration

## Overview

This guide covers setup for:
1. **Prisma ORM** with Prisma Accelerate (PostgreSQL)
2. **SendGrid MCP Server** for Claude Desktop

---

## Part 1: Prisma Setup

### What You Get

- ✅ Type-safe database queries
- ✅ Auto-generated TypeScript types
- ✅ Connection pooling via Prisma Accelerate
- ✅ Schema migrations
- ✅ Query optimization

### Configuration

#### 1. Add to `.env`:

```bash
# Prisma Accelerate (you already have these!)
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqd3RfaWQiOjEsInNlY3VyZV9rZXkiOiJza182TnlkUnpmRmxNWHlFMk1GVnlHN3oiLCJhcGlfa2V5IjoiMDFLODBKUkRNUEhZVFRHMzU2U1hBR0FHTlkiLCJ0ZW5hbnRfaWQiOiI3MTI3NWQyN2Q4NTI0ZGRmY2E2YTU4YmIwM2RjNzA4ZDcxY2Y1MTY2OWYyNjQyZDM0MTdjMjUxMjQzM2MxMGQ5IiwiaW50ZXJuYWxfc2VjcmV0IjoiNTk4MGNlNTQtMzRjZC00MjVjLWI5ZWYtZGQzNmExYmMyZjQ0In0.XKEh5GTvtf4HjTfxNxQZapHygBtCXacmBL1G4aGCP30

DIRECT_DATABASE_URL=postgres://71275d27d8524ddfca6a58bb03dc708d71cf51669f2642d3417c2512433c10d9:sk_6NydRzfFlMXyE2MFVyG7z@db.prisma.io:5432/postgres?sslmode=require
```

#### 2. Generate Prisma Client:

```bash
cd packages/backend
npx prisma generate
```

This creates TypeScript types for all your database tables.

#### 3. Test Connection:

```typescript
// Test in Node
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Query users
const users = await prisma.user.findMany();
console.log(users);
```

### Prisma Schema Overview

Your database has **10 tables**:

1. **reports** - Damage assessment reports
2. **users** - Google OAuth users
3. **user_subscriptions** - Stripe subscriptions
4. **subscription_history** - Subscription audit trail
5. **free_trial_tokens** - Trial management
6. **device_fingerprints** - Device tracking
7. **payment_verifications** - Card validations
8. **login_sessions** - Session management
9. **trial_fraud_flags** - Fraud detection
10. **trial_usage** - Usage analytics

All tables are now accessible via:
```typescript
prisma.report.findMany()
prisma.user.findUnique()
prisma.userSubscription.create()
// ... etc
```

### Migration Commands

```bash
# Generate Prisma Client after schema changes
npx prisma generate

# Push schema changes to database
npx prisma db push

# Create migrations
npx prisma migrate dev --name description

# View database in browser
npx prisma studio
```

### Example Usage

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a user
const user = await prisma.user.create({
  data: {
    googleId: 'google-123',
    email: 'user@example.com',
    name: 'John Doe',
    emailVerified: true,
  },
});

// Get active subscriptions
const subscriptions = await prisma.userSubscription.findMany({
  where: {
    status: 'active',
  },
  include: {
    user: true,
    history: true,
  },
});

// Create a report
const report = await prisma.report.create({
  data: {
    propertyAddress: '123 Main St, Sydney NSW',
    damageType: 'water',
    damageDescription: 'Burst pipe flooding',
    state: 'NSW',
    summary: 'Water damage assessment...',
    scopeOfWork: { items: [] },
    itemizedEstimate: { items: [] },
    totalCost: 5000.00,
    complianceNotes: { notes: [] },
    authorityToProceed: 'Approved',
    model: 'claude-sonnet-4',
  },
});

// Always close connection
await prisma.$disconnect();
```

---

## Part 2: SendGrid MCP Server Setup

### What You Get

- ✅ Send emails through Claude
- ✅ Manage contact lists
- ✅ Create templates
- ✅ View email analytics
- ✅ Validate email addresses

### Installation

SendGrid MCP server is already built at:
```
D:\RestoreAssist\sendgrid-mcp\build\index.js
```

### Configuration for Claude Desktop

#### 1. Get SendGrid API Key:

1. Go to https://app.sendgrid.com/settings/api_keys
2. Create API Key → Full Access
3. Copy the key (starts with `SG.`)

#### 2. Add to Claude Desktop Config:

**Location**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sendgrid": {
      "command": "node",
      "args": ["D:\\RestoreAssist\\sendgrid-mcp\\build\\index.js"],
      "env": {
        "SENDGRID_API_KEY": "SG.your_api_key_here"
      },
      "disabled": false,
      "autoApprove": [
        "list_contacts",
        "list_contact_lists",
        "list_templates",
        "list_verified_senders",
        "list_suppression_groups",
        "get_stats",
        "validate_email"
      ]
    }
  }
}
```

**Important**: Replace `D:\\RestoreAssist` with your actual path.

#### 3. Restart Claude Desktop

Close and reopen Claude Desktop app.

### Available Tools

Once configured, you can ask Claude to:

- **"Send a test email to my@email.com"**
- **"List all my SendGrid contact lists"**
- **"Create an email template for password reset"**
- **"Show me email statistics for last 7 days"**
- **"Validate email address user@example.com"**
- **"List all verified senders"**

### Example Requests

**Send an email:**
```
Send an email to john@example.com with subject "Welcome" and body "Thanks for signing up!"
```

**Create contact list:**
```
Create a SendGrid contact list called "Trial Users"
```

**Get email stats:**
```
Show me SendGrid email statistics from 2025-10-01 to 2025-10-20
```

**Create template:**
```
Create a SendGrid template called "Welcome Email" with this HTML:
<html><body>Hello {{name}}, welcome to RestoreAssist!</body></html>
```

---

## Part 3: Integration

### Using Both Together

```typescript
import { PrismaClient } from '@prisma/client';
import { emailService } from './services/emailService';

const prisma = new PrismaClient();

// Get user from database
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' },
});

// Send email (via SendGrid)
if (user) {
  await emailService.sendCheckoutConfirmation({
    email: user.email,
    customerName: user.name || 'Customer',
    planName: 'Professional',
    subscriptionId: 'sub-123',
    amount: 29.99,
    currency: 'AUD',
  });
}

// Log in database
await prisma.trialUsage.create({
  data: {
    userId: user.userId,
    tokenId: 'token-123',
    actionType: 'email_sent',
    metadata: {
      emailType: 'checkout_confirmation',
    },
  },
});
```

### Testing Setup

```bash
# Test Prisma connection
cd packages/backend
npx prisma studio

# Test SendGrid (in Claude Desktop)
# Just ask: "List my SendGrid verified senders"

# Test email system
npm run dev
curl -X POST http://localhost:3001/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "checkout.session.completed", "data": {...}}'
```

---

## Troubleshooting

### Prisma Issues

**"Can't reach database server"**
- Check `DATABASE_URL` is correct
- Verify Prisma Accelerate API key is valid
- Ensure database is running

**"Invalid prisma.schema file"**
- Run `npx prisma format` to format schema
- Run `npx prisma validate` to check for errors

**"Type errors after schema changes"**
- Run `npx prisma generate` to regenerate types
- Restart TypeScript server (VS Code: Cmd+Shift+P → Restart TS Server)

### SendGrid MCP Issues

**"SendGrid MCP server not showing"**
- Check Claude Desktop config JSON is valid
- Verify path to `sendgrid-mcp/build/index.js` is correct
- Restart Claude Desktop completely

**"SENDGRID_API_KEY invalid"**
- Verify API key starts with `SG.`
- Check API key has "Full Access" or "Mail Send" permission
- Generate new API key if needed

**"Permission denied" errors**
- Add tools to `autoApprove` array in config
- Or approve manually when Claude asks

---

## Next Steps

### For Prisma:

1. ✅ Run `npx prisma generate` to create TypeScript types
2. ✅ Replace `pg-promise` queries with Prisma queries
3. ✅ Test with `npx prisma studio` (database GUI)
4. ✅ Create migrations for schema changes

### For SendGrid MCP:

1. ✅ Get SendGrid API key
2. ✅ Add to Claude Desktop config
3. ✅ Restart Claude Desktop
4. ✅ Test by asking Claude to list contacts

### Recommended Order:

1. **Test Prisma first** - Verify database connection
2. **Test SendGrid MCP** - Verify Claude can send emails
3. **Migrate queries** - Replace pg-promise with Prisma
4. **Test integration** - Verify everything works together

---

## Benefits

### With Prisma:
- 🎯 Type safety - Catch errors at compile time
- 🚀 Auto-completion - IDE knows all your tables/columns
- 🔒 SQL injection protection - Parameterized queries
- ⚡ Connection pooling - Better performance
- 📊 Query optimization - Efficient queries

### With SendGrid MCP:
- 💬 Interactive testing - Send emails through conversation
- 📧 Template management - Create/edit templates easily
- 📈 Analytics access - View stats without dashboard
- ✅ Email validation - Test addresses instantly
- 👥 List management - Organize contacts via Claude

---

## Support Resources

**Prisma:**
- Docs: https://www.prisma.io/docs
- Discord: https://pris.ly/discord
- Studio: Run `npx prisma studio`

**SendGrid:**
- Dashboard: https://app.sendgrid.com
- API Docs: https://docs.sendgrid.com
- Status: https://status.sendgrid.com

**MCP Protocol:**
- Docs: https://modelcontextprotocol.io
- GitHub: https://github.com/modelcontextprotocol

---

**Last Updated**: October 20, 2025
**Status**: Ready for Configuration ✅
