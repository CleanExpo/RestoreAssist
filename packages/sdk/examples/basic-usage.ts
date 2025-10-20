/**
 * Basic Usage Example
 *
 * This example demonstrates the basic usage of the RestoreAssist SDK:
 * - Authentication
 * - Generating a report
 * - Listing reports
 * - Exporting a report
 */

import { RestoreAssistClient, RestoreAssistError } from '@restoreassist/sdk';

async function basicExample() {
  // Initialise the client
  const client = new RestoreAssistClient({
    baseUrl: 'http://localhost:3001/api',
    onError: (error) => {
      console.error('SDK Error:', error.message);
    }
  });

  try {
    console.log('=== RestoreAssist SDK - Basic Usage Example ===\n');

    // Step 1: Login
    console.log('1. Logging in...');
    const { user, tokens } = await client.auth.login({
      email: 'demo@restoreassist.com',
      password: 'demo123'
    });
    console.log(`   Logged in as: ${user.name} (${user.email})`);
    console.log(`   Role: ${user.role}\n`);

    // Step 2: Generate a report
    console.log('2. Generating damage assessment report...');
    const report = await client.reports.generate({
      propertyAddress: '123 Main St, Sydney NSW 2000',
      damageType: 'water',
      damageDescription: 'Burst pipe in upstairs bathroom causing water damage to ceiling and walls in living room. Water staining visible on ceiling, walls are damp to touch.',
      state: 'NSW',
      clientName: 'John Smith',
      insuranceCompany: 'ABC Insurance',
      claimNumber: 'CLM-2024-001'
    });
    console.log(`   Report generated: ${report.reportId}`);
    console.log(`   Total cost: $${report.totalCost.toFixed(2)}`);
    console.log(`   Summary: ${report.summary.substring(0, 100)}...\n`);

    // Step 3: List all reports
    console.log('3. Fetching recent reports...');
    const { reports, total, page, totalPages } = await client.reports.list({
      page: 1,
      limit: 5,
      sortBy: 'timestamp',
      order: 'desc'
    });
    console.log(`   Total reports: ${total}`);
    console.log(`   Showing page ${page} of ${totalPages}`);
    console.log(`   Reports on this page: ${reports.length}\n`);

    // Step 4: Get specific report
    console.log('4. Fetching specific report...');
    const specificReport = await client.reports.get(report.reportId);
    console.log(`   Report ID: ${specificReport.reportId}`);
    console.log(`   Address: ${specificReport.propertyAddress}`);
    console.log(`   Scope of work items: ${specificReport.scopeOfWork.length}`);
    console.log(`   Itemized estimate items: ${specificReport.itemizedEstimate.length}\n`);

    // Step 5: Export report
    console.log('5. Exporting report to PDF...');
    const exportResult = await client.reports.export(report.reportId, {
      format: 'pdf',
      includeCharts: true,
      includeBranding: true
    });
    console.log(`   Export successful: ${exportResult.success}`);
    console.log(`   File name: ${exportResult.fileName}`);
    console.log(`   Download URL: ${exportResult.downloadUrl}\n`);

    // Step 6: Get statistics
    console.log('6. Fetching statistics...');
    const stats = await client.reports.getStats();
    console.log(`   Total reports: ${stats.totalReports}`);
    console.log(`   Total value: $${stats.totalValue.toFixed(2)}`);
    console.log(`   Average value: $${stats.averageValue.toFixed(2)}`);
    console.log(`   Reports by damage type:`, stats.byDamageType);
    console.log(`   Reports by state:`, stats.byState);
    console.log(`   Recent reports (last 7 days): ${stats.recentReports}\n`);

    // Step 7: Logout
    console.log('7. Logging out...');
    await client.auth.logout();
    console.log('   Logged out successfully\n');

    console.log('=== Example completed successfully ===');

  } catch (error) {
    if (error instanceof RestoreAssistError) {
      console.error('RestoreAssist Error:', error.message);
      console.error('Status Code:', error.statusCode);
    } else {
      console.error('Unexpected error:', error);
    }
    process.exit(1);
  }
}

// Run the example
basicExample();
