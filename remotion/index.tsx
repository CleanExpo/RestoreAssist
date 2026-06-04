import {registerRoot} from 'remotion';
import React from 'react';
import {Composition} from 'remotion';
import {DashboardWalkthrough} from './compositions/dashboard-walkthrough';
import {CreateInspection} from './compositions/create-inspection';
import {ReportBuilder} from './compositions/report-builder';
import {ClientPortal} from './compositions/client-portal';
import {SignUp} from './compositions/marketing/sign-up';
import {SignIn} from './compositions/marketing/sign-in';
import {WhyRestoreAssist} from './compositions/why-restoreassist';
import {BYOKExplainer} from './compositions/byok-explainer';
import {InspectionsList} from './compositions/inspections-list';
import {EvidenceCapture} from './compositions/evidence-capture';
import {MoistureMapping} from './compositions/moisture-mapping';
import {QuoteBuilder} from './compositions/quote-builder';
import {InvoiceGenerator} from './compositions/invoice-generator';
import {ComplianceChecklists} from './compositions/compliance-checklists';
import {AnalyticsOverview} from './compositions/analytics-overview';
import {TeamManagement} from './compositions/team-management';
import {MobileWorkflow} from './compositions/mobile-workflow';
import {PricingOverview} from './compositions/pricing-overview';
import {HeroProductOverview} from './compositions/hero-product-overview';
import {SetupWizardFull} from './compositions/setup-wizard-full';
import {SettingsConfig} from './compositions/settings-config';
import {IntegrationConnect} from './compositions/integration-connect';
import {ReportExportPDF} from './compositions/report-export-pdf';
import {ForContractors} from './compositions/for-contractors';
import {ForAssessors} from './compositions/for-assessors';
import {ForPropertyManagers} from './compositions/for-property-managers';
import {ROIExplainer} from './compositions/roi-explainer';
import {EvidenceChain} from './compositions/evidence-chain';
import {LinkedInShort1} from './compositions/linkedin-short-1';
import {LinkedInShort2} from './compositions/linkedin-short-2';
import {TrainingS500Standard} from './compositions/training-s500-standard';
import {TrainingWaterDamageCat} from './compositions/training-water-damage-cat';
import {TrainingMouldRemediation} from './compositions/training-mould-remediation';
import {TrainingFireSmoke} from './compositions/training-fire-smoke';

export const RemotionRoot = () => (
  <>
    {/* Original 4 Tutorials */}
    <Composition
      id="DashboardWalkthrough"
      component={DashboardWalkthrough}
      durationInFrames={960}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Dashboard Walkthrough",
        stepDurations: [110, 130, 230, 210, 180, 100],
      }}
    />
    <Composition
      id="CreateInspection"
      component={CreateInspection}
      durationInFrames={1260}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Create an Inspection",
        stepDurations: [110, 130, 200, 180, 170, 160, 210, 100],
      }}
    />
    <Composition
      id="ReportBuilder"
      component={ReportBuilder}
      durationInFrames={1080}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Build Professional Reports",
        stepDurations: [110, 130, 260, 180, 160, 240],
      }}
    />
    <Composition
      id="ClientPortal"
      component={ClientPortal}
      durationInFrames={960}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Share with Clients",
        stepDurations: [110, 200, 300, 140, 210],
      }}
    />

    {/* Auth Videos */}
    <Composition
      id="SignUp"
      component={SignUp}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Getting Started", stepDurations: [250, 360, 540, 450, 300]}}
    />
    <Composition
      id="SignIn"
      component={SignIn}
      durationInFrames={1350}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Welcome Back", stepDurations: [250, 405, 315, 380]}}
    />

    {/* Marketing */}
    <Composition
      id="WhyRestoreAssist"
      component={WhyRestoreAssist}
      durationInFrames={1080}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{}}
    />

    {/* BYOK (Bring Your Own Knowledge) */}
    <Composition
      id="BYOKExplainer"
      component={BYOKExplainer}
      durationInFrames={1260}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{}}
    />

    {/* Feature Deep Dives */}
    <Composition
      id="InspectionsList"
      component={InspectionsList}
      durationInFrames={1020}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Manage Inspections", stepDurations: [110, 190, 240, 180, 160, 140]}}
    />
    <Composition
      id="EvidenceCapture"
      component={EvidenceCapture}
      durationInFrames={960}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Capture Evidence", stepDurations: [110, 200, 260, 180, 210]}}
    />
    <Composition
      id="MoistureMapping"
      component={MoistureMapping}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Moisture Mapping", stepDurations: [110, 220, 180, 190, 200]}}
    />
    <Composition
      id="QuoteBuilder"
      component={QuoteBuilder}
      durationInFrames={960}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Build Quotes", stepDurations: [110, 200, 190, 230, 150, 80]}}
    />
    <Composition
      id="InvoiceGenerator"
      component={InvoiceGenerator}
      durationInFrames={840}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Generate Invoices", stepDurations: [110, 210, 190, 160, 170]}}
    />
    <Composition
      id="ComplianceChecklists"
      component={ComplianceChecklists}
      durationInFrames={960}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Compliance Checklists", stepDurations: [110, 200, 220, 210, 120]}}
    />
    <Composition
      id="AnalyticsOverview"
      component={AnalyticsOverview}
      durationInFrames={1350}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Business Analytics", stepDurations: [180, 330, 280, 265, 235]}}
    />
    <Composition
      id="TeamManagement"
      component={TeamManagement}
      durationInFrames={1500}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Team Management", stepDurations: [180, 290, 325, 240, 225]}}
    />

    {/* Cross-Platform */}
    <Composition
      id="MobileWorkflow"
      component={MobileWorkflow}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{title: "Field Mobile Workflow", stepDurations: [110, 200, 180, 220, 190]}}
    />

    {/* Pricing */}
    <Composition
      id="PricingOverview"
      component={PricingOverview}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{}}
    />

    {/* P0 Launch Blockers (new) */}
    <Composition id="HeroProductOverview" component={HeroProductOverview} durationInFrames={1800} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="SetupWizardFull" component={SetupWizardFull} durationInFrames={5400} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="SettingsConfig" component={SettingsConfig} durationInFrames={1800} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="IntegrationConnect" component={IntegrationConnect} durationInFrames={2250} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="ReportExportPDF" component={ReportExportPDF} durationInFrames={1800} fps={30} width={1920} height={1080} defaultProps={{}} />

    {/* P1 Marketing Videos (2026-06-04) */}
    <Composition id="ForContractors" component={ForContractors} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="ForAssessors" component={ForAssessors} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="ForPropertyManagers" component={ForPropertyManagers} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="ROIExplainer" component={ROIExplainer} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="EvidenceChain" component={EvidenceChain} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="LinkedInShort1" component={LinkedInShort1} durationInFrames={1800} fps={30} width={1080} height={1920} defaultProps={{}} />
    <Composition id="LinkedInShort2" component={LinkedInShort2} durationInFrames={1800} fps={30} width={1080} height={1920} defaultProps={{}} />

    {/* P3 Training Videos (2026-06-04) */}
    <Composition id="TrainingS500Standard" component={TrainingS500Standard} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="TrainingWaterDamageCat" component={TrainingWaterDamageCat} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="TrainingMouldRemediation" component={TrainingMouldRemediation} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
    <Composition id="TrainingFireSmoke" component={TrainingFireSmoke} durationInFrames={1320} fps={30} width={1920} height={1080} defaultProps={{}} />
  </>
);

registerRoot(RemotionRoot);
