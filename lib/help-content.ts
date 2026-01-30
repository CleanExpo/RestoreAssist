/**
 * Help Content Library
 * Centralized help content for context-sensitive help throughout the app
 */

export interface HelpContent {
  title: string
  description: string
  steps?: string[]
  tips?: string[]
  relatedTopics?: string[]
}

export const helpContent: Record<string, HelpContent> = {
  // Report Creation
  'report-creation': {
    title: 'Creating Reports',
    description:
      'Reports are the core of RestoreAssist. Each report documents a restoration project from initial inspection through to final cost estimation.',
    steps: [
      'Click "New Report" from the dashboard or sidebar',
      'Enter basic job details (client name, property address, hazard type)',
      'Add inspection findings and affected areas',
      'Generate scope of works based on findings',
      'Create cost estimation from scope items',
      'Generate PDF reports for clients and insurers',
    ],
    tips: [
      'Use the AI chatbot to help draft sections',
      'Upload existing PDFs to auto-populate fields',
      'Save drafts frequently - reports auto-save every 30 seconds',
    ],
  },

  // Claims Analysis
  'claims-analysis': {
    title: 'Claims Analysis',
    description:
      'Upload insurance claim documents and let AI analyze them for missing elements, inconsistencies, and areas that need attention.',
    steps: [
      'Navigate to Claims Analysis from the sidebar',
      'Upload claim documents (PDF, images, or text)',
      'Wait for AI analysis to complete',
      'Review identified issues and recommendations',
      'Export analysis report or add findings to your report',
    ],
    tips: [
      'Upload multiple documents at once for batch analysis',
      'Higher quality scans produce better results',
      'Review AI suggestions - they may need human verification',
    ],
  },

  // Cost Libraries
  'cost-libraries': {
    title: 'Cost Libraries',
    description:
      'Cost libraries contain your standard rates for labour, equipment, chemicals, and other items used in restoration work.',
    steps: [
      'Go to Cost Libraries in the sidebar',
      'Create a new library or edit an existing one',
      'Add cost items with rates, units, and categories',
      'Set the library as default for new estimates',
      'Import items from CSV or copy from other libraries',
    ],
    tips: [
      'Create separate libraries for different regions or project types',
      'Update rates regularly to match current market prices',
      'Use categories to organize items (Demolition, Drying, Cleaning, etc.)',
    ],
  },

  // Integrations
  integrations: {
    title: 'External Integrations',
    description:
      'Connect RestoreAssist to your accounting software and job management systems for seamless data synchronization.',
    steps: [
      'Navigate to Integrations in the sidebar',
      'Click Connect on your preferred provider (Xero, QuickBooks, MYOB, ServiceM8, Ascora)',
      'Authorize the connection through the provider\'s login',
      'Configure sync settings (clients, invoices, jobs)',
      'Use the Sync button to manually sync or enable auto-sync',
    ],
    tips: [
      'Test with a few records before enabling full sync',
      'Check mapping settings to ensure fields align correctly',
      'Integration requires an active subscription',
    ],
  },

  // NIR System
  'nir-inspection': {
    title: 'National Inspection Report (NIR)',
    description:
      'The NIR module provides standardized inspection documentation that complies with Australian restoration industry requirements.',
    steps: [
      'Create a new inspection from the Inspections page',
      'Complete each section: Site Details, Affected Areas, Moisture Readings, Environmental Conditions',
      'Add photos and attach them to specific areas',
      'Generate classification based on water category and class',
      'Export to PDF or link to a report',
    ],
    tips: [
      'Take photos in good lighting with clear reference points',
      'Record moisture readings at multiple heights (0cm, 30cm, 100cm)',
      'Document all affected materials, not just visible damage',
    ],
  },

  // Authority Forms
  'authority-forms': {
    title: 'Authority Forms & E-Signatures',
    description:
      'Create and send authority forms for client approval with legally-binding electronic signatures.',
    steps: [
      'Open a report and go to the Authority Forms tab',
      'Select a template (Work Authorization, Privacy Consent, etc.)',
      'Review and customize the form content',
      'Add signatories (client, property owner, insurer)',
      'Send signature requests via email',
      'Track signature status and download completed forms',
    ],
    tips: [
      'Forms can be signed on any device (phone, tablet, computer)',
      'Completed forms are timestamped and legally binding',
      'Send reminders for unsigned forms after 24-48 hours',
    ],
  },

  // Interview System
  'interview-system': {
    title: 'Guided Interview System',
    description:
      'The interview system guides technicians through structured data collection with smart question flows and automatic field mapping.',
    steps: [
      'Start a new interview from the Interviews page',
      'Select the interview template (Initial Assessment, Progress Report, etc.)',
      'Answer questions in sequence - skip logic handles irrelevant questions',
      'Review auto-populated report fields',
      'Submit to create or update the associated report',
    ],
    tips: [
      'Answers automatically map to report fields, saving data entry time',
      'Use voice input on mobile devices for faster entry',
      'Interviews can be paused and resumed later',
    ],
  },

  // Team Management
  'team-management': {
    title: 'Team Management',
    description:
      'Invite team members to your organization with different roles and permissions.',
    steps: [
      'Go to Team in the sidebar (Admin/Manager only)',
      'Click "Invite Team Member"',
      'Enter their email and select a role (Manager or Technician)',
      'They\'ll receive an email with login credentials',
      'Manage existing members from the team list',
    ],
    tips: [
      'Managers can create reports and manage their assigned technicians',
      'Technicians can only view and edit reports assigned to them',
      'Admins have full access to all organization data',
    ],
  },

  // Psychrometric Assessment
  psychrometric: {
    title: 'Psychrometric Assessment',
    description:
      'Calculate drying conditions and equipment requirements based on temperature, humidity, and affected area specifications.',
    steps: [
      'Enter ambient conditions (temperature, relative humidity)',
      'Specify affected area dimensions and materials',
      'Input dehumidifier and air mover specifications',
      'Calculate grain depression and estimated drying time',
      'Generate equipment placement recommendations',
    ],
    tips: [
      'Take readings at multiple locations for accuracy',
      'Re-assess conditions daily during active drying',
      'Consider building materials when calculating moisture content',
    ],
  },

  // PDF Upload
  'pdf-upload': {
    title: 'PDF Upload & Parsing',
    description:
      'Upload existing reports or claim documents and let AI extract data to populate report fields automatically.',
    steps: [
      'Click "Upload PDF" when creating or editing a report',
      'Select your PDF file (inspection report, scope, estimate)',
      'Wait for AI processing (typically 30-60 seconds)',
      'Review extracted fields and make corrections',
      'Confirm to populate your report with extracted data',
    ],
    tips: [
      'Clear, text-based PDFs work better than scanned images',
      'Review all extracted data - AI may misinterpret some fields',
      'Use for initial data entry, then verify and complete manually',
    ],
  },
}

/**
 * Get help content by key
 */
export function getHelpContent(key: string): HelpContent | undefined {
  return helpContent[key]
}

/**
 * Get all help content keys
 */
export function getHelpContentKeys(): string[] {
  return Object.keys(helpContent)
}
