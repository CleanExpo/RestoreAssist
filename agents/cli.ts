#!/usr/bin/env node

/**
 * CLI tool to run RestoreAssist AI agents
 *
 * Usage:
 *   npm run agent:build "Fix TypeScript errors"
 *   npm run agent:deploy "Debug Vercel deployment"
 *   npm run agent:dev "Implement new feature"
 */

import { runBuildAgent, runDeploymentAgent, runDevAgent } from './index';

const args = process.argv.slice(2);
const agentType = process.env.AGENT_TYPE;
const task = args.join(' ');

if (!task) {
  console.error('Error: Please provide a task description');
  console.error('Usage: npm run agent:<type> "task description"');
  process.exit(1);
}

async function main() {
  console.log(`\n🤖 Running ${agentType} agent...`);
  console.log(`📋 Task: ${task}\n`);

  try {
    let result;

    switch (agentType) {
      case 'build':
        result = await runBuildAgent(task);
        break;
      case 'deploy':
        result = await runDeploymentAgent(task);
        break;
      case 'dev':
        result = await runDevAgent(task);
        break;
      default:
        console.error(`Error: Unknown agent type "${agentType}"`);
        console.error('Available types: build, deploy, dev');
        process.exit(1);
    }

    console.log('\n✅ Agent completed successfully!\n');
    console.log('Result:', result);

  } catch (error) {
    console.error('\n❌ Agent encountered an error:\n');
    console.error(error);
    process.exit(1);
  }
}

main();
