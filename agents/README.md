# RestoreAssist AI Agents

Specialized AI agents built with Claude Agent SDK to assist with development, build, and deployment tasks.

## Available Agents

### 1. Build Agent (`build-agent.ts`)
Assists with build processes and error resolution.

**Capabilities:**
- Run builds for frontend and backend
- Identify and fix TypeScript compilation errors
- Optimize build configurations
- Manage dependencies and package versions

**Usage:**
```typescript
import { runBuildAgent } from './agents';

await runBuildAgent('Fix all TypeScript errors in the frontend');
await runBuildAgent('Optimize the Vite build configuration');
await runBuildAgent('Update all outdated dependencies');
```

### 2. Deployment Agent (`deployment-agent.ts`)
Assists with Vercel deployments and production issues.

**Capabilities:**
- Configure Vercel deployment settings
- Debug deployment failures
- Manage environment variables
- Handle serverless function issues

**Usage:**
```typescript
import { runDeploymentAgent } from './agents';

await runDeploymentAgent('Debug why the backend deployment is returning 404');
await runDeploymentAgent('Configure environment variables for production');
await runDeploymentAgent('Fix serverless function cold start issues');
```

### 3. Development Agent (`dev-agent.ts`)
General development assistance for new features and debugging.

**Capabilities:**
- Debug runtime issues
- Implement new features
- Refactor code
- Write tests

**Usage:**
```typescript
import { runDevAgent } from './agents';

await runDevAgent('Add email validation to user registration');
await runDevAgent('Debug the Google Drive integration issue');
await runDevAgent('Implement unit tests for the reports service');
```

## Quick Start

### Using the CLI

Run agents directly from the command line:

```bash
# Build tasks
npm run agent:build "Fix TypeScript errors"

# Deployment tasks
npm run agent:deploy "Debug Vercel 404 error"

# Development tasks
npm run agent:dev "Implement password reset feature"
```

### Programmatic Usage

```typescript
import { runBuildAgent, runDeploymentAgent, runDevAgent } from './agents';

// Build assistance
const buildResult = await runBuildAgent('Run full build and fix any errors');
console.log(buildResult);

// Deployment assistance
const deployResult = await runDeploymentAgent('Analyze deployment logs');
console.log(deployResult);

// Development assistance
const devResult = await runDevAgent('Add input validation to forms');
console.log(devResult);
```

## Configuration

Agents are pre-configured with:
- **Model**: Claude Sonnet 4.5
- **Tools**: bash, file, web_search
- **MCP Servers**: filesystem, github (dev agent only)
- **Max Turns**: 10-20 depending on agent type

## Project Context

All agents are aware of:
- RestoreAssist project structure (monorepo with frontend/backend)
- Technology stack (React, Express, TypeScript, Vite)
- Deployment setup (Vercel serverless)
- Common issues and solutions

## Environment Variables

Some agents require environment variables:

```bash
# For GitHub integration (dev agent)
GITHUB_TOKEN=your_github_token

# For Anthropic API
ANTHROPIC_API_KEY=your_api_key
```

## Best Practices

1. **Be Specific**: Provide clear, specific tasks
   - ✅ "Fix the CORS error between frontend and backend on Vercel"
   - ❌ "Fix deployment"

2. **One Task at a Time**: Let agents focus on single objectives
   - ✅ "Update the Stripe integration to use latest API version"
   - ❌ "Update all integrations and fix all bugs"

3. **Review Changes**: Always review agent-generated code before committing

4. **Iterative Refinement**: If results aren't perfect, run again with more context

## Troubleshooting

**Agent not responding:**
- Check ANTHROPIC_API_KEY is set
- Verify internet connection
- Check agent logs for errors

**Unexpected results:**
- Provide more specific instructions
- Check agent's system prompt for context
- Review recent code changes that might affect behavior

## Contributing

To add new agents:
1. Create new agent file in `/agents`
2. Export in `index.ts`
3. Add documentation here
4. Add npm script in root `package.json`
