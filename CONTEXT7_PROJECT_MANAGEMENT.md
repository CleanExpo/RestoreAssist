# Using Context7 MCP for RestoreAssist Project Management

## What is Context7?

Context7 is an MCP server that provides **long-term memory and context management** for AI conversations. It's already installed and configured in your Claude Code setup!

## How It Works

Context7 stores:
- ✅ Project goals and requirements
- ✅ Technical decisions and rationale
- ✅ Todo lists and task tracking
- ✅ Known issues and solutions
- ✅ Architecture decisions
- ✅ Development progress

This context **persists across sessions**, so you never lose track of where you are in the project.

## Using Context7 for RestoreAssist

### 1. Create Project Context

Once your MCPs are configured and Claude Code restarts, I can use Context7 to store:

**A. Project Overview**
```
Project: RestoreAssist
Purpose: AI-powered disaster restoration documentation platform
Tech Stack: React, TypeScript, Vite, Express, PostgreSQL, Claude SDK
Deployment: Vercel (separate frontend & backend)
```

**B. Current Status**
```
✅ Completed:
- SDK Agent system for report generation
- MCP servers installed (Stripe, Vercel, Google Cloud, etc.)
- Monorepo structure with workspaces
- Basic authentication system
- Database service
- Export functionality (PDF/DOCX)

🚧 In Progress:
- Vercel backend deployment (404 errors)
- Frontend environment variables
- MCP credential configuration

📋 Planned:
- [To be captured in comprehensive todo list]
```

**C. Known Issues**
```
Issue: Backend deployment returns 404
Location: restore-assist-backend.vercel.app
Root Cause: Serverless configuration issues
Status: Fixes committed, awaiting deployment

Issue: Frontend missing VITE_GOOGLE_CLIENT_ID
Location: restore-assist-frontend.vercel.app
Status: Needs Google OAuth client setup
```

### 2. Create Comprehensive Todo List

After MCP setup, we'll use Context7 to create a master todo list:

```
DEPLOYMENT & PRODUCTION
- [ ] Verify backend deployment with serverless fixes
- [ ] Set up Google OAuth client for frontend
- [ ] Configure Vercel environment variables
- [ ] Test end-to-end application flow
- [ ] Set up production database (PostgreSQL)

INTEGRATIONS
- [ ] Complete Stripe payment integration
- [ ] Implement Google Drive file storage
- [ ] Set up Ascora sync
- [ ] Configure ServiceM8 integration

FEATURES
- [ ] Multi-user dashboard
- [ ] Real-time collaboration
- [ ] Report sharing & collaboration
- [ ] Mobile-responsive design
- [ ] Offline support

TESTING & QA
- [ ] Unit tests for agent system
- [ ] Integration tests for API
- [ ] E2E tests with Playwright
- [ ] Load testing for agents

DOCUMENTATION
- [ ] API documentation
- [ ] User guide
- [ ] Admin guide
- [ ] Deployment guide
```

### 3. Track Technical Decisions

Context7 can store important decisions:

```
Decision: Use SDK Agents for report generation
Rationale: No two jobs are alike - need dynamic, data-driven reports
Date: 2025-01-17
Impact: Core differentiator, requires ANTHROPIC_API_KEY

Decision: Separate Vercel projects for frontend/backend
Rationale: Monorepo unified deployment had routing issues
Date: 2025-01-16
Impact: Need to manage two deployments, configure CORS
```

### 4. Maintain Knowledge Base

Store solutions to common problems:

```
Problem: Vercel serverless functions crash with ENOENT
Solution: Use /tmp directory for file storage in serverless
File: exportService.ts, skillsService.ts
Code Pattern:
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const dir = isServerless ? '/tmp/exports' : './exports';
```

## Benefits for RestoreAssist

### Continuity Across Sessions
Every time you start Claude Code, context7 will:
- Remember where the project is
- Show pending tasks
- Recall technical decisions
- Provide relevant context

### Team Collaboration
If multiple developers work on RestoreAssist:
- Shared context about project state
- Consistent understanding of architecture
- Documented decisions and rationale

### Progress Tracking
Clear visibility into:
- What's been completed
- What's in progress
- What's blocked
- What's next

## Example Context7 Usage

**Me asking Context7 to store project info:**
```
"Store in context: RestoreAssist uses SDK Agents as the core engine
for generating unique damage assessment reports. Each job creates a
dedicated agent with job-specific context. No two reports are alike."
```

**Me asking Context7 to recall:**
```
"What's the current deployment status of RestoreAssist?"
→ Context7 provides stored information about Vercel deployments,
  known issues, and pending configuration
```

**Me updating status:**
```
"Mark task complete: SDK Agent production system implemented"
→ Context7 updates the todo list
```

## Next Steps

1. **Complete MCP_SETUP_GUIDE.md** - Get your API keys
2. **Update mcp.json** - I'll add your credentials
3. **Restart Claude Code** - Load all MCP servers
4. **Create Master Todo** - Use context7 to build comprehensive project plan

Ready to proceed! Once you have your credentials, I'll:
1. Update your configuration
2. Use context7 to create a complete project roadmap
3. Ensure all context is preserved for future sessions

---

## Technical Note

Context7 is configured in your mcp.json (line 36-39):
```json
"context7": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "--node-options=--experimental-vm-modules", "@upstash/context7-mcp@1.0.6"]
}
```

It uses Upstash's infrastructure for persistent storage, so your project context is preserved even when Claude Code restarts.
