/**
 * Advanced Usage Example
 *
 * This example demonstrates advanced features:
 * - Batch report generation
 * - Error handling
 * - Admin operations
 * - Integrations
 */

import {
  RestoreAssistClient,
  RestoreAssistError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  type GenerateReportRequest
} from '@restoreassist/sdk';

async function advancedExample() {
  // Initialise client with auto-login
  const client = new RestoreAssistClient({
    baseUrl: 'http://localhost:3001/api',
    credentials: {
      email: 'admin@restoreassist.com',
      password: 'admin123'
    },
    onTokenRefresh: (tokens) => {
      console.log('Token refreshed, expires in:', tokens.expiresIn, 'seconds');
    },
    onError: (error) => {
      console.error('Global error handler:', error.message);
    }
  });

  try {
    console.log('=== RestoreAssist SDK - Advanced Usage Example ===\n');

    // Wait for auto-login to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Example 1: Batch report generation
    console.log('1. Batch Report Generation');
    console.log('   Generating multiple reports in parallel...');

    const reportRequests: GenerateReportRequest[] = [
      {
        propertyAddress: '456 Water St, Brisbane QLD 4000',
        damageType: 'water',
        damageDescription: 'Flood damage to ground floor',
        state: 'QLD',
        clientName: 'Jane Doe'
      },
      {
        propertyAddress: '789 Fire Ave, Melbourne VIC 3000',
        damageType: 'fire',
        damageDescription: 'Kitchen fire, smoke damage throughout',
        state: 'VIC',
        clientName: 'Bob Johnson'
      },
      {
        propertyAddress: '321 Storm Rd, Perth WA 6000',
        damageType: 'storm',
        damageDescription: 'Roof damage from severe storm',
        state: 'WA',
        clientName: 'Alice Brown'
      }
    ];

    const reports = await Promise.all(
      reportRequests.map(req => client.reports.generate(req))
    );

    console.log(`   Generated ${reports.length} reports successfully`);
    reports.forEach((report, i) => {
      console.log(`   - Report ${i + 1}: ${report.reportId} ($${report.totalCost.toFixed(2)})`);
    });
    console.log();

    // Example 2: Advanced error handling
    console.log('2. Error Handling Examples');

    // Try to get non-existent report
    try {
      await client.reports.get('non-existent-id');
    } catch (error) {
      if (error instanceof NotFoundError) {
        console.log('   ✓ Handled NotFoundError correctly');
      }
    }

    // Try to generate invalid report
    try {
      await client.reports.generate({
        propertyAddress: '',  // Invalid
        damageType: 'water',
        damageDescription: '',  // Invalid
        state: 'NSW'
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        console.log('   ✓ Handled ValidationError correctly');
        if (error.errors) {
          console.log('     Validation errors:', error.errors);
        }
      }
    }
    console.log();

    // Example 3: Report updates
    console.log('3. Report Updates');
    const firstReport = reports[0];
    const updated = await client.reports.update(firstReport.reportId, {
      summary: 'Updated summary with additional details',
      complianceNotes: [
        ...firstReport.complianceNotes,
        'Additional compliance note added via SDK'
      ]
    });
    console.log(`   Updated report ${updated.reportId}`);
    console.log(`   New summary length: ${updated.summary.length} chars\n`);

    // Example 4: Pagination
    console.log('4. Pagination Example');
    let currentPage = 1;
    let totalPages = 0;
    let allReports = [];

    do {
      const result = await client.reports.list({
        page: currentPage,
        limit: 5,
        sortBy: 'totalCost',
        order: 'desc'
      });

      allReports.push(...result.reports);
      totalPages = result.totalPages;
      console.log(`   Loaded page ${currentPage}/${totalPages} (${result.reports.length} reports)`);
      currentPage++;
    } while (currentPage <= totalPages && currentPage <= 3); // Limit to 3 pages for demo

    console.log(`   Total reports loaded: ${allReports.length}\n`);

    // Example 5: Admin operations
    console.log('5. Admin Operations');

    const adminStats = await client.admin.getStats();
    console.log('   System statistics:');
    console.log(`   - Total reports: ${adminStats.totalReports}`);
    console.log(`   - Total users: ${adminStats.userStats.totalUsers}`);
    console.log(`   - Active users: ${adminStats.userStats.activeUsers}`);
    console.log(`   - Database: ${adminStats.systemInfo.database}`);
    console.log(`   - Memory used: ${(adminStats.systemInfo.memory.used / 1024 / 1024).toFixed(2)} MB`);
    console.log();

    const health = await client.admin.health();
    console.log('   Health check:');
    console.log(`   - Status: ${health.status}`);
    console.log(`   - Environment: ${health.environment}`);
    if (health.database) {
      console.log(`   - Database connected: ${health.database.connected}`);
    }
    console.log();

    // Example 6: Integrations
    console.log('6. Integration Status');

    const integrations = await client.integrations.list();
    console.log(`   Available integrations: ${integrations.length}`);
    integrations.forEach(integration => {
      console.log(`   - ${integration.name}: ${integration.enabled ? 'enabled' : 'disabled'}`);
    });
    console.log();

    // Check ServiceM8 integration
    try {
      const servicem8Status = await client.integrations.servicem8.getStatus();
      console.log('   ServiceM8 Integration:');
      console.log(`   - Enabled: ${servicem8Status.enabled}`);
      console.log(`   - Configured: ${servicem8Status.configured}`);

      if (servicem8Status.enabled && servicem8Status.configured) {
        const jobs = await client.integrations.servicem8.listJobs();
        console.log(`   - Jobs available: ${jobs.length}`);
      }
    } catch (error) {
      console.log('   ServiceM8: Not configured');
    }
    console.log();

    // Check Google Drive integration
    try {
      const driveStatus = await client.integrations.googleDrive.getStatus();
      console.log('   Google Drive Integration:');
      console.log(`   - Enabled: ${driveStatus.enabled}`);
      console.log(`   - Configured: ${driveStatus.configured}`);
    } catch (error) {
      console.log('   Google Drive: Not configured');
    }
    console.log();

    // Example 7: Export and download
    console.log('7. Export and Download');
    const reportToExport = reports[0];

    const exportResult = await client.reports.export(reportToExport.reportId, {
      format: 'docx',
      includeCharts: true,
      includeBranding: true
    });

    console.log(`   Exported report to: ${exportResult.fileName}`);

    // Download the exported file
    const blob = await client.exports.download(exportResult.fileName);
    console.log(`   Downloaded file size: ${blob.size} bytes\n`);

    // Example 8: User management (admin only)
    console.log('8. User Management');

    const users = await client.auth.listUsers();
    console.log(`   Total users: ${users.length}`);
    users.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
    });
    console.log();

    // Register a new user
    const newUser = await client.auth.register({
      email: `test-${Date.now()}@example.com`,
      password: 'test123',
      name: 'Test User',
      role: 'viewer',
      company: 'Test Company'
    });
    console.log(`   Created new user: ${newUser.name} (${newUser.userId})`);

    // Delete the test user
    await client.auth.deleteUser(newUser.userId);
    console.log(`   Deleted test user\n`);

    // Example 9: Authentication flow
    console.log('9. Token Management');
    console.log(`   Current token: ${client.getAccessToken()?.substring(0, 20)}...`);
    console.log(`   Is authenticated: ${client.isAuthenticated()}`);

    const currentUser = await client.auth.getCurrentUser();
    console.log(`   Current user: ${currentUser.name} (${currentUser.role})\n`);

    console.log('=== Advanced example completed successfully ===');

  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error('Authentication failed. Please check your credentials.');
    } else if (error instanceof RestoreAssistError) {
      console.error('API Error:', error.message);
      console.error('Status:', error.statusCode);
    } else {
      console.error('Unexpected error:', error);
    }
    process.exit(1);
  }
}

// Run the example
advancedExample();
