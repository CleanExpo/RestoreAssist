import {renderMedia, getCompositions} from '@remotion/renderer';
import {existsSync, readFileSync, readdirSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

/**
 * Paths are resolved against this file, not process.cwd().
 *
 * The previous `path.join(process.cwd(), 'remotion', ...)` only resolved when
 * the script happened to be run from `tools/`. From the repo root — which is
 * where `npm run render:tutorials` runs it — it pointed at a `remotion/`
 * directory that does not exist.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Remotion resolves `staticFile()` against the bundle's public directory, and
 * `bundle()` defaults it to `public/` beside the entry point. This project has
 * no such folder — the 63 narration MP3s live in `assets/` — so every
 * `<Audio src={staticFile('narration/…')} />` resolved to nothing and each
 * video rendered silent. Point publicDir at `assets/` and `staticFile('narration/x.mp3')`
 * resolves to `assets/narration/x.mp3`.
 */
const PUBLIC_DIR = path.join(HERE, 'assets');
const NARRATION_DIR = path.join(PUBLIC_DIR, 'narration');
const COMPOSITIONS_DIR = path.join(HERE, 'compositions');

/**
 * Fail before rendering if a composition asks for narration that is not there.
 *
 * Remotion does not error on a missing audio source — it renders the video
 * without it. That is exactly how nine silent tutorials shipped and were only
 * caught by someone playing one, so the check has to happen here.
 */
function assertNarrationPresent(): void {
  const missing: string[] = [];
  const files = existsSync(COMPOSITIONS_DIR) ? readdirSync(COMPOSITIONS_DIR) : [];

  for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    const source = readFileSync(path.join(COMPOSITIONS_DIR, file), 'utf8');
    for (const [, asset] of source.matchAll(/staticFile\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!existsSync(path.join(PUBLIC_DIR, asset))) {
        missing.push(`${file} -> ${asset}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error(
      `[render] ${missing.length} asset reference(s) do not resolve under ${PUBLIC_DIR}.`,
    );
    console.error('[render] Rendering now would produce videos with no audio.');
    for (const entry of missing) console.error(`  missing: ${entry}`);
    process.exit(1);
  }

  const narrationCount = existsSync(NARRATION_DIR)
    ? readdirSync(NARRATION_DIR).filter((f) => f.endsWith('.mp3')).length
    : 0;
  console.log(`[render] narration assets present: ${narrationCount}`);
}

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

  // New-client welcome (shown at the top of /setup)
  {id: 'OnboardingWelcome', fileName: 'onboarding-welcome.mp4'},

];

async function renderAll() {
  const entry = path.join(HERE, 'index.tsx');
  if (!existsSync(entry)) {
    console.error(`[render] entry point not found: ${entry}`);
    process.exit(1);
  }

  assertNarrationPresent();

  console.log('[render] bundling Remotion project...');
  const {bundle} = await import('@remotion/bundler');
  const bundleLocationResult = await bundle({
    entryPoint: entry,
    publicDir: PUBLIC_DIR,
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

    const outputPath = path.join(HERE, 'output', compInfo.fileName);
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
