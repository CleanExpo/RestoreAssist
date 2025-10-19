/**
 * RestoreAssist AI Agents
 *
 * This module exports specialized AI agents built with Claude Agent SDK
 * to assist with various development, build, and deployment tasks.
 */

export { buildAgent, runBuildAgent } from './build-agent';
export { deploymentAgent, runDeploymentAgent } from './deployment-agent';
export { devAgent, runDevAgent } from './dev-agent';

/**
 * Quick Start Examples:
 *
 * // Build Agent - Fix build errors
 * import { runBuildAgent } from './agents';
 * await runBuildAgent('Fix all TypeScript errors in the frontend');
 *
 * // Deployment Agent - Debug Vercel deployment
 * import { runDeploymentAgent } from './agents';
 * await runDeploymentAgent('Analyze why the backend deployment is failing');
 *
 * // Dev Agent - Implement feature
 * import { runDevAgent } from './agents';
 * await runDevAgent('Add email validation to the user registration form');
 */

// Export agent types for TypeScript
export type { Agent } from '@anthropic-ai/claude-agent-sdk';
