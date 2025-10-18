/**
 * Simple Node.js Example (JavaScript)
 *
 * This example shows how to use the SDK in a plain JavaScript Node.js project
 */

// For CommonJS (require)
// const { RestoreAssistClient } = require('@restoreassist/sdk');

// For ES Modules (import) - make sure your package.json has "type": "module"
import { RestoreAssistClient } from '@restoreassist/sdk';

async function main() {
  // Create client
  const client = new RestoreAssistClient({
    baseUrl: 'http://localhost:3001/api'
  });

  try {
    // Login
    console.log('Logging in...');
    await client.auth.login({
      email: 'demo@restoreassist.com',
      password: 'demo123'
    });
    console.log('✓ Logged in successfully\n');

    // Generate a report
    console.log('Generating report...');
    const report = await client.reports.generate({
      propertyAddress: '100 George St, Sydney NSW 2000',
      damageType: 'water',
      damageDescription: 'Water damage from burst pipe in ceiling cavity. Extensive water staining on ceiling and walls.',
      state: 'NSW',
      clientName: 'Demo Client',
      insuranceCompany: 'Demo Insurance',
      claimNumber: 'DEMO-001'
    });

    console.log('✓ Report generated successfully');
    console.log(`  Report ID: ${report.reportId}`);
    console.log(`  Total Cost: $${report.totalCost.toFixed(2)}`);
    console.log(`  Items: ${report.itemizedEstimate.length}`);
    console.log();

    // Show scope of work
    console.log('Scope of Work:');
    report.scopeOfWork.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item}`);
    });
    console.log();

    // Show itemized estimate
    console.log('Itemized Estimate (first 5 items):');
    report.itemizedEstimate.slice(0, 5).forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.description}`);
      console.log(`     Qty: ${item.quantity} | Unit: $${item.unitCost.toFixed(2)} | Total: $${item.totalCost.toFixed(2)}`);
    });
    console.log();

    // Get statistics
    console.log('Fetching statistics...');
    const stats = await client.reports.getStats();
    console.log(`✓ Total Reports: ${stats.totalReports}`);
    console.log(`  Total Value: $${stats.totalValue.toFixed(2)}`);
    console.log(`  Average Value: $${stats.averageValue.toFixed(2)}`);
    console.log();

    // List recent reports
    console.log('Recent reports:');
    const { reports } = await client.reports.list({
      page: 1,
      limit: 5,
      sortBy: 'timestamp',
      order: 'desc'
    });

    reports.forEach((r, i) => {
      const date = new Date(r.timestamp).toLocaleDateString();
      console.log(`  ${i + 1}. ${r.reportId} - ${r.propertyAddress} - $${r.totalCost.toFixed(2)} (${date})`);
    });
    console.log();

    console.log('✓ Example completed successfully!');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.statusCode) {
      console.error('Status:', error.statusCode);
    }
    process.exit(1);
  }
}

// Run the example
main();
