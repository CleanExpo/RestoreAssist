import {renderMedia, getCompositions} from '@remotion/renderer';
import path from 'path';

const compositionsToRender = [
  // New-client welcome (top of /setup)
  {id: 'OnboardingWelcome', fileName: 'onboarding-welcome.mp4'},
  // Original 4 tutorials
  {id: 'DashboardWalkthrough', fileName: 'dashboard-walkthrough.mp4'},
  {id: 'CreateInspection', fileName: 'create-inspection.mp4'},
  {id: 'ReportBuilder', fileName: 'report-builder.mp4'},
  {id: 'ClientPortal', fileName: 'client-portal.mp4'},
  // Auth
  {id: 'SignUp', fileName: 'sign-up.mp4'},
  {id: 'SignIn', fileName: 'sign-in.mp4'},
  // Marketing
  {id: 'WhyRestoreAssist', fileName: 'why-restoreassist.mp4'},
  {id: 'BYOKExplainer', fileName: 'byok-explainer.mp4'},
  // Features
  {id: 'InspectionsList', fileName: 'inspections-list.mp4'},
  {id: 'EvidenceCapture', fileName: 'evidence-capture.mp4'},
  {id: 'MoistureMapping', fileName: 'moisture-mapping.mp4'},
  {id: 'QuoteBuilder', fileName: 'quote-builder.mp4'},
  {id: 'InvoiceGenerator', fileName: 'invoice-generator.mp4'},
  {id: 'ComplianceChecklists', fileName: 'compliance-checklists.mp4'},
  {id: 'AnalyticsOverview', fileName: 'analytics-overview.mp4'},
  {id: 'TeamManagement', fileName: 'team-management.mp4'},
  // P0 Launch Blockers
  {id: 'HeroProductOverview', fileName: 'hero-product-overview.mp4'},
  {id: 'SetupWizardFull', fileName: 'setup-wizard-full.mp4'},
  {id: 'SettingsConfig', fileName: 'settings-config.mp4'},
  {id: 'IntegrationConnect', fileName: 'integration-connect.mp4'},
  {id: 'ReportExportPDF', fileName: 'report-export-pdf.mp4'},

  // P1 Marketing Videos
  {id: 'ForContractors', fileName: 'for-contractors.mp4'},
  {id: 'ForAssessors', fileName: 'for-assessors.mp4'},
  {id: 'ForPropertyManagers', fileName: 'for-property-managers.mp4'},
  {id: 'ROIExplainer', fileName: 'roi-explainer.mp4'},
  {id: 'EvidenceChain', fileName: 'evidence-chain.mp4'},
  {id: 'LinkedInShort1', fileName: 'linkedin-short-1.mp4'},
  {id: 'LinkedInShort2', fileName: 'linkedin-short-2.mp4'},

  // P3 Training Videos
  {id: 'TrainingS500Standard', fileName: 'training-s500-standard.mp4'},
  {id: 'TrainingWaterDamageCat', fileName: 'training-water-damage-cat.mp4'},
  {id: 'TrainingMouldRemediation', fileName: 'training-mould-remediation.mp4'},
  {id: 'TrainingFireSmoke', fileName: 'training-fire-smoke.mp4'},

  // P2 Feature Deep-Dives
  {id: 'EvidenceChainDeepDive', fileName: 'evidence-chain-deep-dive.mp4'},
  {id: 'PhotoAnnotationDeepDive', fileName: 'photo-annotation-deep-dive.mp4'},
  {id: 'TemplateBuilder', fileName: 'template-builder.mp4'},
  {id: 'BulkOperations', fileName: 'bulk-operations.mp4'},
  {id: 'SearchFilter', fileName: 'search-filter.mp4'},
  {id: 'NotificationsDeepDive', fileName: 'notifications-deep-dive.mp4'},
  {id: 'DataImport', fileName: 'data-import.mp4'},
  {id: 'APIWebhooks', fileName: 'api-webhooks.mp4'},
  {id: 'WhiteLabel', fileName: 'white-label.mp4'},
  {id: 'BackupExport', fileName: 'backup-export.mp4'},
  {id: 'MoistureDeepDive', fileName: 'moisture-deep-dive.mp4'},
  {id: 'MobileDeepDive', fileName: 'mobile-deep-dive.mp4'},

  // Tutorial Videos (2026-06-04)
  {id: 'TutorialLogin', fileName: 'tutorial-login.mp4'},
  {id: 'TutorialSignup', fileName: 'tutorial-signup.mp4'},
  {id: 'TutorialSetupWizard', fileName: 'tutorial-setup-wizard.mp4'},
  {id: 'TutorialDashboard', fileName: 'tutorial-dashboard.mp4'},
  {id: 'TutorialInspections', fileName: 'tutorial-inspections.mp4'},
  {id: 'TutorialReports', fileName: 'tutorial-reports.mp4'},
  {id: 'TutorialBilling', fileName: 'tutorial-billing.mp4'},
  {id: 'TutorialTeam', fileName: 'tutorial-team.mp4'},
  {id: 'TutorialCompliance', fileName: 'tutorial-compliance.mp4'},
  {id: 'TutorialIntegrations', fileName: 'tutorial-integrations.mp4'},
  {id: 'WizardSignin', fileName: 'wizard-signin.mp4'},
  {id: 'WizardSignup', fileName: 'wizard-signup.mp4'},
  {id: 'WizardSetup', fileName: 'wizard-setup.mp4'},
  {id: 'WizardDashboard', fileName: 'wizard-dashboard.mp4'},
  {id: 'WizardIntegrations', fileName: 'wizard-integrations.mp4'},
  {id: 'WizardHealth', fileName: 'wizard-health.mp4'},

];

async function renderAll() {
  const entry = path.join(process.cwd(), 'remotion', 'index.tsx');

  console.log('[render] bundling Remotion project...');
  const {bundle} = await import('@remotion/bundler');
  const bundleLocationResult = await bundle({
    entryPoint: entry,
    onProgress: (progress) => {
      console.log(`[bundle] ${Math.round(progress * 100)}%`);
    },
  });

  console.log('[render] getting compositions...');
  const comps = await getCompositions(bundleLocationResult, {inputProps: {}});

  for (const compInfo of compositionsToRender) {
    const comp = comps.find((c) => c.id === compInfo.id);
    if (!comp) {
      console.error(`[render] composition ${compInfo.id} not found`);
      continue;
    }

    const outputPath = path.join(process.cwd(), 'remotion', 'output', compInfo.fileName);
    console.log(`[render] rendering ${compInfo.id} → ${outputPath}`);

    await renderMedia({
      composition: comp,
      serveUrl: bundleLocationResult,
      codec: 'h264',
      outputLocation: outputPath,
      onProgress: ({progress}) => {
        console.log(`[${compInfo.id}] ${Math.round(progress * 100)}%`);
      },
      overwrite: true,
    });

    console.log(`[render] ✓ ${compInfo.id} complete`);
  }

  console.log('[render] all done');
}

renderAll().catch((err) => {
  console.error('[render] fatal error:', err);
  process.exit(1);
});
