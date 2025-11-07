#!/usr/bin/env node

/**
 * Test Orchestrator - Coordinates all test agents
 * Runs specialized agents in parallel and aggregates results
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class TestOrchestrator {
  constructor(configPath) {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    this.results = {
      startTime: new Date().toISOString(),
      agents: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
  }

  async runAgent(agentName, agentConfig) {
    console.log(`\n🚀 Starting ${agentName} agent (Priority: ${agentConfig.priority})...`);

    const agentPath = path.join(__dirname, 'agents', `${agentName}-agent.js`);

    if (!fs.existsSync(agentPath)) {
      console.log(`⚠️  Agent file not found: ${agentPath}`);
      return {
        agent: agentName,
        status: 'skipped',
        reason: 'Agent file not found'
      };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      const agent = spawn('node', [agentPath, JSON.stringify(this.config)], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      agent.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[${agentName}] ${output.trim()}`);
      });

      agent.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      agent.on('close', (code) => {
        const duration = Date.now() - startTime;
        const result = {
          agent: agentName,
          status: code === 0 ? 'passed' : 'failed',
          duration: `${duration}ms`,
          exitCode: code,
          stdout: stdout,
          stderr: stderr
        };

        if (code === 0) {
          console.log(`✅ ${agentName} agent completed successfully`);
        } else {
          console.log(`❌ ${agentName} agent failed with code ${code}`);
        }

        resolve(result);
      });
    });
  }

  async run() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🤖 Test Orchestrator - Autonomous Testing System    ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\nTarget: ${this.config.productionUrl}`);
    console.log(`Parallel Execution: ${this.config.parallelAgents ? 'Enabled' : 'Disabled'}\n`);

    // Sort agents by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const enabledAgents = Object.entries(this.config.agents)
      .filter(([_, config]) => config.enabled)
      .sort(([_, a], [__, b]) =>
        priorityOrder[a.priority] - priorityOrder[b.priority]
      );

    if (this.config.parallelAgents) {
      // Run all agents in parallel
      console.log('🔄 Running agents in parallel...\n');
      const promises = enabledAgents.map(([name, config]) =>
        this.runAgent(name, config)
      );
      const results = await Promise.all(promises);
      results.forEach(result => {
        this.results.agents[result.agent] = result;
        this.updateSummary(result);
      });
    } else {
      // Run agents sequentially
      console.log('🔄 Running agents sequentially...\n');
      for (const [name, config] of enabledAgents) {
        const result = await this.runAgent(name, config);
        this.results.agents[result.agent] = result;
        this.updateSummary(result);
      }
    }

    this.results.endTime = new Date().toISOString();
    this.generateReport();
    this.displaySummary();

    return this.results.summary.failed === 0 ? 0 : 1;
  }

  updateSummary(result) {
    this.results.summary.total++;
    if (result.status === 'passed') {
      this.results.summary.passed++;
    } else if (result.status === 'failed') {
      this.results.summary.failed++;
    } else {
      this.results.summary.warnings++;
    }
  }

  generateReport() {
    const reportDir = this.config.reporting.outputDir;
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `test-report-${Date.now()}.json`
    );

    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📊 Full report saved to: ${reportPath}`);
  }

  displaySummary() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  📊 Test Summary                                      ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Agents:     ${this.results.summary.total}`);
    console.log(`✅ Passed:        ${this.results.summary.passed}`);
    console.log(`❌ Failed:        ${this.results.summary.failed}`);
    console.log(`⚠️  Warnings:      ${this.results.summary.warnings}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Display agent-specific issues
    Object.entries(this.results.agents).forEach(([name, result]) => {
      if (result.status === 'failed') {
        console.log(`\n❌ ${name} Agent Issues:`);
        if (result.stderr) {
          console.log(result.stderr);
        }
      }
    });
  }
}

// Run orchestrator
const configPath = path.join(__dirname, 'config', 'test-config.json');
const orchestrator = new TestOrchestrator(configPath);

orchestrator.run()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('💥 Orchestrator failed:', error);
    process.exit(1);
  });
