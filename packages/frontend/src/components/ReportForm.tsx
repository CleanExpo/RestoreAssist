import React, { useState } from 'react';
import { generateReport } from '../services/api';
import { ClaudeService } from '../services/claudeService';
import { getStoredApiKey } from './ApiKeyManager';
import { DamageType, AustralianState, GenerateReportRequest } from '../types';

interface Props {
  onReportGenerated: () => void;
}

export function ReportForm({ onReportGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<GenerateReportRequest>({
    propertyAddress: '',
    damageType: 'water',
    damageDescription: '',
    state: 'NSW',
    clientName: '',
    insuranceCompany: '',
    claimNumber: ''
  });

  // Generate mock report data for development/screenshot mode
  const generateMockReport = (formData: GenerateReportRequest) => {
    const mockReportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Generate realistic itemized estimate based on damage type
    // Focused on property restoration services (not rebuilding/construction)
    const baseItems = {
      water: [
        { description: 'Emergency water extraction service (incl. equipment and labour)', quantity: 45, unitCost: 12.50, totalCost: 562.50 },
        { description: 'Industrial dehumidifier setup and operation (7 days)', quantity: 2, unitCost: 95.00, totalCost: 190.00 },
        { description: 'Air mover equipment rental and positioning (7 days)', quantity: 4, unitCost: 45.00, totalCost: 180.00 },
        { description: 'Moisture monitoring, testing, and daily documentation', quantity: 7, unitCost: 75.00, totalCost: 525.00 },
        { description: 'Remove and dispose of water-damaged materials', quantity: 45, unitCost: 18.00, totalCost: 810.00 },
        { description: 'Structural drying services (walls, floors, subfloors)', quantity: 45, unitCost: 22.00, totalCost: 990.00 },
        { description: 'Antimicrobial treatment and sanitisation (all affected areas)', quantity: 45, unitCost: 14.50, totalCost: 652.50 },
        { description: 'Content pack-out, inventory, and secure storage', quantity: 1, unitCost: 850.00, totalCost: 850.00 },
      ],
      fire: [
        { description: 'Emergency board-up and temporary protection (24/7 response)', quantity: 1, unitCost: 650.00, totalCost: 650.00 },
        { description: 'Soot and smoke damage cleaning (walls, ceilings, surfaces)', quantity: 30, unitCost: 28.00, totalCost: 840.00 },
        { description: 'HEPA air filtration system deployment (14 days)', quantity: 2, unitCost: 120.00, totalCost: 240.00 },
        { description: 'Thermal fogging and odour neutralisation treatment', quantity: 30, unitCost: 18.00, totalCost: 540.00 },
        { description: 'Contents cleaning, restoration, and pack-out services', quantity: 1, unitCost: 1200.00, totalCost: 1200.00 },
        { description: 'Remove and dispose of fire-damaged materials', quantity: 30, unitCost: 35.00, totalCost: 1050.00 },
        { description: 'Deep cleaning and deodorisation (IICRC certified methods)', quantity: 30, unitCost: 32.00, totalCost: 960.00 },
        { description: 'Seal and encapsulate smoke damage (prevent re-emergence)', quantity: 30, unitCost: 25.00, totalCost: 750.00 },
      ],
      storm: [
        { description: 'Emergency tarpaulin and weatherproofing (immediate response)', quantity: 1, unitCost: 650.00, totalCost: 650.00 },
        { description: 'Water extraction from storm water ingress', quantity: 20, unitCost: 22.00, totalCost: 440.00 },
        { description: 'Debris removal, site cleanup, and disposal', quantity: 20, unitCost: 28.00, totalCost: 560.00 },
        { description: 'Structural drying services (comprehensive)', quantity: 20, unitCost: 24.00, totalCost: 480.00 },
        { description: 'Moisture monitoring and progress documentation (5 days)', quantity: 5, unitCost: 85.00, totalCost: 425.00 },
        { description: 'Dehumidification equipment deployment (7 days)', quantity: 2, unitCost: 95.00, totalCost: 190.00 },
        { description: 'Contents protection, inventory, and pack-out', quantity: 1, unitCost: 750.00, totalCost: 750.00 },
      ],
      flood: [
        { description: 'Category 3 contaminated water extraction (emergency response)', quantity: 60, unitCost: 18.00, totalCost: 1080.00 },
        { description: 'Industrial dehumidification systems (14 days continuous operation)', quantity: 4, unitCost: 125.00, totalCost: 500.00 },
        { description: 'Remove and dispose of contaminated materials (Category 3 protocols)', quantity: 60, unitCost: 28.00, totalCost: 1680.00 },
        { description: 'Antimicrobial treatment (Category 3 certified products)', quantity: 60, unitCost: 16.00, totalCost: 960.00 },
        { description: 'HEPA air filtration and scrubbing (14 days)', quantity: 3, unitCost: 120.00, totalCost: 360.00 },
        { description: 'Structural drying, moisture monitoring, and testing', quantity: 60, unitCost: 24.00, totalCost: 1440.00 },
        { description: 'Contents cleaning, restoration, and professional pack-out', quantity: 1, unitCost: 1500.00, totalCost: 1500.00 },
        { description: 'Final sanitisation, testing, and clearance certification', quantity: 60, unitCost: 12.00, totalCost: 720.00 },
      ],
      mold: [
        { description: 'Comprehensive mould inspection and air quality testing (certified)', quantity: 1, unitCost: 450.00, totalCost: 450.00 },
        { description: 'Containment setup with negative air pressure system', quantity: 1, unitCost: 750.00, totalCost: 750.00 },
        { description: 'HEPA air filtration system deployment (10 days)', quantity: 2, unitCost: 120.00, totalCost: 240.00 },
        { description: 'Mould remediation and safe removal (IICRC S520 standards)', quantity: 25, unitCost: 65.00, totalCost: 1625.00 },
        { description: 'HEPA vacuuming and surface cleaning (all affected areas)', quantity: 25, unitCost: 28.00, totalCost: 700.00 },
        { description: 'Antimicrobial treatment application (EPA-registered products)', quantity: 25, unitCost: 22.00, totalCost: 550.00 },
        { description: 'Post-remediation air quality testing and verification', quantity: 1, unitCost: 380.00, totalCost: 380.00 },
        { description: 'Final clearance, documentation, and certification', quantity: 1, unitCost: 250.00, totalCost: 250.00 },
      ],
    };

    // Enhanced damage-specific summaries and scope of work
    const damageSpecificContent = {
      water: {
        summary: `WATER DAMAGE RESTORATION ASSESSMENT\n\nThis comprehensive restoration report addresses water damage sustained at ${formData.propertyAddress}. Our certified technicians have conducted a thorough assessment of the affected areas and developed a detailed scope of work to restore the property to pre-loss condition.\n\nDAMAGE ASSESSMENT: ${formData.damageDescription}\n\nOur emergency response team has identified the extent of water intrusion, documented moisture levels using calibrated equipment, and established a systematic drying plan. This estimate encompasses all necessary restoration services including water extraction, structural drying, dehumidification, antimicrobial treatment, and contents restoration.\n\nURGENCY: Water damage requires immediate attention to prevent secondary damage including mould growth, structural deterioration, and permanent material degradation. We recommend commencing restoration services within 24-48 hours of this assessment.`,
        scopeOfWork: [
          'EMERGENCY RESPONSE: Immediate site assessment, moisture mapping, and thermal imaging inspection',
          'WATER EXTRACTION: Complete extraction of standing water using truck-mounted and portable extraction equipment',
          'STRUCTURAL DRYING: Strategic placement of industrial dehumidifiers and air movers based on psychrometric calculations',
          'MOISTURE MONITORING: Daily moisture readings and documentation using moisture meters and hygrometers',
          'MATERIAL REMOVAL: Remove and dispose of non-salvageable water-damaged materials (drywall, insulation, flooring)',
          'ANTIMICROBIAL TREATMENT: Apply EPA-registered antimicrobial solutions to all affected surfaces to prevent microbial growth',
          'DEHUMIDIFICATION: Continuous dehumidification to achieve optimal drying conditions (40-50% RH)',
          'CONTENTS RESTORATION: Professional pack-out, cleaning, and secure storage of salvageable contents',
          'DOCUMENTATION: Comprehensive photographic documentation and moisture readings throughout the restoration process',
          'FINAL VERIFICATION: Final moisture testing and clearance certification confirming property is dry to industry standards',
        ],
        complianceNotes: [
          `REGULATORY COMPLIANCE: All restoration work performed in accordance with ${formData.state} Work Health and Safety regulations, Australian Standards AS/NZS 3733:2018 (Electrical installations - Domestic installations), and AS 4852 (Indoor air quality)`,
          'INDUSTRY STANDARDS: Restoration procedures follow IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration',
          'TECHNICIAN CERTIFICATION: All work performed by IICRC-certified Water Damage Restoration Technicians (WRT) with current qualifications',
          'EQUIPMENT STANDARDS: All equipment meets Australian safety standards and is regularly calibrated and maintained',
          'INSURANCE COMPLIANCE: Documentation and reporting format complies with insurance industry requirements and standards',
          'ENVIRONMENTAL PROTECTION: All waste disposal conducted in accordance with environmental protection regulations and local council requirements',
          'QUALITY ASSURANCE: Ongoing project management and quality control inspections throughout the restoration process',
        ],
      },
      fire: {
        summary: `FIRE AND SMOKE DAMAGE RESTORATION ASSESSMENT\n\nThis comprehensive restoration report addresses fire and smoke damage sustained at ${formData.propertyAddress}. Our certified fire restoration specialists have conducted a detailed assessment of the affected areas and developed a systematic restoration plan.\n\nDAMAGE ASSESSMENT: ${formData.damageDescription}\n\nOur assessment identifies the extent of fire, smoke, and soot damage throughout the property. This estimate covers emergency board-up, debris removal, smoke odour elimination, soot cleaning, contents restoration, and comprehensive deodorisation services.\n\nRESTORATION APPROACH: Fire restoration requires specialised techniques and equipment to address smoke penetration, odour issues, and soot contamination. Our certified technicians utilise IICRC-approved methods to restore the property to pre-loss condition.`,
        scopeOfWork: [
          'EMERGENCY PROTECTION: Immediate board-up and temporary weather protection to secure the property',
          'SAFETY ASSESSMENT: Structural safety evaluation and identification of hazardous materials or conditions',
          'SOOT REMOVAL: Comprehensive soot and smoke residue removal from all affected surfaces using specialised cleaning agents',
          'ODOUR ELIMINATION: Thermal fogging, ozone treatment, and hydroxyl generator deployment for complete odour neutralisation',
          'HEPA AIR FILTRATION: Industrial HEPA air scrubbers to remove particulates and improve indoor air quality',
          'CONTENTS RESTORATION: Professional cleaning and restoration of salvageable contents using ultrasonic and specialised cleaning methods',
          'DEBRIS REMOVAL: Safe removal and disposal of fire-damaged materials and debris',
          'DEEP CLEANING: IICRC-certified cleaning methods for walls, ceilings, and all affected surfaces',
          'SEALING AND ENCAPSULATION: Application of sealant products to prevent smoke odour re-emergence',
          'FINAL DEODORISATION: Multi-stage deodorisation process including air duct cleaning where applicable',
        ],
        complianceNotes: [
          `REGULATORY COMPLIANCE: All restoration work performed in accordance with ${formData.state} Work Health and Safety regulations, fire safety codes, and Australian Standards`,
          'INDUSTRY STANDARDS: Restoration procedures follow IICRC S520 Standard for Professional Mould Remediation and S500 Water Damage Restoration where applicable',
          'FIRE RESTORATION CERTIFICATION: All work performed by IICRC-certified Fire and Smoke Restoration Technicians (FSRT)',
          'HAZARDOUS MATERIALS: Proper handling and disposal of potentially hazardous materials in accordance with environmental regulations',
          'AIR QUALITY TESTING: Post-restoration air quality testing available upon request to verify safe indoor air quality',
          'INSURANCE DOCUMENTATION: Comprehensive documentation including before/during/after photography for insurance claims',
          'ENVIRONMENTAL PROTECTION: All waste disposal and chemical usage complies with environmental protection regulations',
        ],
      },
      storm: {
        summary: `STORM DAMAGE RESTORATION ASSESSMENT\n\nThis comprehensive restoration report addresses storm damage sustained at ${formData.propertyAddress}. Our emergency response team has conducted an immediate assessment of storm-related damage and developed an action plan for rapid restoration.\n\nDAMAGE ASSESSMENT: ${formData.damageDescription}\n\nOur assessment covers all storm-related damage including water ingress, structural exposure, and debris impact. This estimate includes emergency weatherproofing, water extraction, debris removal, structural drying, and contents protection services.\n\nIMM EDIATE ACTION REQUIRED: Storm damage requires urgent attention to prevent further deterioration from weather exposure and water ingress. Emergency protection and water extraction services should commence immediately.`,
        scopeOfWork: [
          'EMERGENCY RESPONSE: Immediate deployment of emergency response team for damage assessment and triage',
          'EMERGENCY WEATHERPROOFING: Installation of heavy-duty tarpaulins and temporary protection against further weather exposure',
          'WATER EXTRACTION: Complete extraction of storm water ingress using industrial extraction equipment',
          'DEBRIS REMOVAL: Safe removal and disposal of storm debris, damaged materials, and fallen objects',
          'STRUCTURAL DRYING: Comprehensive structural drying using commercial dehumidifiers and air movers',
          'MOISTURE MONITORING: Daily moisture testing and monitoring to ensure complete drying and prevent mould growth',
          'CONTENTS PROTECTION: Emergency pack-out and secure storage of vulnerable contents to prevent further damage',
          'SITE SECURITY: Temporary security measures to protect exposed areas and prevent unauthorised access',
          'DOCUMENTATION: Comprehensive photographic and written documentation for insurance purposes',
          'RESTORATION PLANNING: Detailed planning for subsequent restoration work once emergency stabilisation is complete',
        ],
        complianceNotes: [
          `REGULATORY COMPLIANCE: All emergency response and restoration work performed in accordance with ${formData.state} emergency response regulations and Australian Standards`,
          'SAFETY PROTOCOLS: Strict adherence to safety protocols including fall protection, electrical safety, and structural assessment',
          'EMERGENCY RESPONSE CERTIFICATION: Work performed by trained emergency response personnel with current certifications',
          'ENVIRONMENTAL PROTECTION: Responsible disposal of storm debris and damaged materials in accordance with waste management regulations',
          'INSURANCE STANDARDS: Documentation and reporting meets insurance industry emergency response requirements',
          'QUALITY ASSURANCE: Ongoing monitoring and quality control throughout the emergency response and restoration process',
        ],
      },
      flood: {
        summary: `FLOOD DAMAGE RESTORATION ASSESSMENT - CATEGORY 3 WATER\n\nThis comprehensive restoration report addresses flood damage (Category 3 contaminated water) sustained at ${formData.propertyAddress}. Our certified flood restoration specialists have conducted a thorough assessment following Category 3 water protocols.\n\nDAMAGE ASSESSMENT: ${formData.damageDescription}\n\nCategory 3 water (flood water) is grossly contaminated and may contain pathogenic, toxigenic, or other harmful agents. Our restoration plan follows strict protocols for contaminated water restoration including complete material removal where required, thorough decontamination, and air quality management.\n\nHEALTH AND SAFETY: Flood restoration requires strict safety protocols and specialised equipment. Our technicians utilise personal protective equipment (PPE) and follow IICRC Category 3 water restoration standards to ensure safe and effective restoration.`,
        scopeOfWork: [
          'SAFETY PROTOCOLS: Implementation of Category 3 water safety protocols including PPE requirements and containment procedures',
          'CONTAMINATED WATER EXTRACTION: Complete extraction of Category 3 flood water using dedicated contaminated water equipment',
          'MATERIAL REMOVAL: Remove and properly dispose of all porous materials contacted by Category 3 water (drywall, insulation, carpets)',
          'ANTIMICROBIAL TREATMENT: Comprehensive antimicrobial treatment using EPA-registered Category 3 water disinfectants',
          'STRUCTURAL DISINFECTION: Complete disinfection of all structural elements contacted by flood water',
          'AIR QUALITY MANAGEMENT: HEPA air scrubbers and negative air pressure to control airborne contaminants during remediation',
          'DEHUMIDIFICATION: Industrial-grade dehumidification to achieve rapid structural drying and prevent mould growth',
          'MOISTURE MONITORING: Comprehensive moisture monitoring and testing throughout the drying process',
          'CONTENTS EVALUATION: Professional evaluation of contents for salvageability based on Category 3 water contamination',
          'FINAL SANITISATION: Multi-stage final sanitisation and clearance testing to ensure safe occupancy',
        ],
        complianceNotes: [
          `REGULATORY COMPLIANCE: All flood restoration work performed in accordance with ${formData.state} health and safety regulations, biosafety guidelines, and Australian Standards for contaminated water remediation`,
          'CATEGORY 3 WATER PROTOCOLS: Strict adherence to IICRC S500 Category 3 water restoration standards and guidelines',
          'TECHNICIAN CERTIFICATION: All work performed by IICRC-certified Applied Microbial Remediation Technicians (AMRT) with Category 3 water training',
          'WASTE DISPOSAL: All contaminated materials disposed of in accordance with waste management regulations and environmental protection requirements',
          'AIR QUALITY VERIFICATION: Post-remediation air quality testing available to verify safe indoor environmental quality',
          'DISINFECTION STANDARDS: All disinfection products are EPA-registered and approved for Category 3 water restoration',
          'INSURANCE COMPLIANCE: Comprehensive documentation meets insurance requirements for contaminated water claims',
        ],
      },
      mold: {
        summary: `MOULD REMEDIATION ASSESSMENT AND ACTION PLAN\n\nThis comprehensive mould remediation report addresses microbial growth identified at ${formData.propertyAddress}. Our certified mould remediation specialists have conducted a thorough inspection and developed a systematic remediation plan following IICRC S520 standards.\n\nASSESSMENT FINDINGS: ${formData.damageDescription}\n\nOur certified mould inspector has documented the extent of microbial growth, identified moisture sources, and established containment requirements. This remediation plan encompasses professional mould removal, HEPA air filtration, antimicrobial treatment, and post-remediation verification testing.\n\nREMEDIATION APPROACH: Mould remediation requires proper containment, HEPA filtration, source moisture control, and systematic removal procedures. Our certified technicians follow IICRC S520 Standard for Professional Mould Remediation to ensure safe and effective remediation.`,
        scopeOfWork: [
          'PRE-REMEDIATION ASSESSMENT: Comprehensive mould inspection and air quality testing to establish baseline conditions',
          'CONTAINMENT SETUP: Installation of physical barriers and negative air pressure containment to prevent cross-contamination',
          'HEPA AIR FILTRATION: Deployment of industrial HEPA air scrubbers with negative air pressure to control airborne spores',
          'SOURCE MOISTURE CONTROL: Identification and correction of moisture sources contributing to mould growth',
          'MOULD REMEDIATION: Systematic removal of mould-affected materials following IICRC S520 protocols',
          'HEPA VACUUMING: Comprehensive HEPA vacuuming of all surfaces within containment area',
          'SURFACE CLEANING: Thorough cleaning of all salvageable surfaces using antimicrobial cleaning solutions',
          'ANTIMICROBIAL TREATMENT: Application of EPA-registered antimicrobial products to prevent future microbial growth',
          'POST-REMEDIATION VERIFICATION: Independent post-remediation air quality testing and visual inspection',
          'CLEARANCE CERTIFICATION: Issuance of formal clearance certification upon successful completion and testing',
        ],
        complianceNotes: [
          `REGULATORY COMPLIANCE: All mould remediation work performed in accordance with ${formData.state} health and safety regulations, AS/NZS 3666 (Air handling and water systems), and indoor air quality standards`,
          'INDUSTRY STANDARDS: Remediation procedures strictly follow IICRC S520 Standard and Reference Guide for Professional Mould Remediation',
          'TECHNICIAN CERTIFICATION: All work performed by IICRC-certified Applied Microbial Remediation Technicians (AMRT) with current qualifications',
          'AIR QUALITY TESTING: Pre and post-remediation air quality testing conducted by independent certified industrial hygienist',
          'CONTAINMENT PROTOCOLS: Proper containment and negative air pressure maintained throughout remediation process',
          'WASTE DISPOSAL: All mould-contaminated materials disposed of in sealed bags in accordance with waste regulations',
          'DOCUMENTATION: Comprehensive photographic documentation and laboratory testing results provided for all projects',
        ],
      },
    };

    const items = baseItems[formData.damageType] || baseItems.water;
    const subtotal = items.reduce((sum, item) => sum + item.totalCost, 0);
    const gst = subtotal * 0.10; // 10% GST for Australia
    const totalCost = subtotal + gst;

    const damageContent = damageSpecificContent[formData.damageType] || damageSpecificContent.water;

    const mockReport = {
      reportId: mockReportId,
      propertyAddress: formData.propertyAddress,
      damageType: formData.damageType,
      state: formData.state,
      timestamp: new Date().toISOString(),
      summary: damageContent.summary,
      scopeOfWork: damageContent.scopeOfWork,
      itemizedEstimate: items,
      subtotal: subtotal,
      gst: gst,
      totalCost: totalCost,
      complianceNotes: damageContent.complianceNotes,
      paymentTerms: {
        depositRequired: subtotal * 0.30, // 30% deposit
        paymentSchedule: [
          { milestone: 'Deposit upon approval', percentage: 30, amount: subtotal * 0.30 },
          { milestone: 'Upon completion of emergency services', percentage: 40, amount: subtotal * 0.40 },
          { milestone: 'Final payment upon project completion', percentage: 30, amount: subtotal * 0.30 },
        ],
        terms: [
          'Payment terms: 30% deposit, 40% upon completion of emergency services, 30% upon project completion',
          'Payment methods accepted: Bank transfer (EFT), Credit card, Cheque',
          'Deposit required before commencement of restoration services',
          'Insurance claims: We can provide direct billing to insurance companies with approved claims',
          'All prices are in Australian Dollars (AUD) and include GST',
          'Payment due within 7 days of invoice date unless alternative arrangements have been made',
          'Late payment may incur interest charges of 2% per month on overdue amounts',
        ],
      },
      authorityToProceed: `AUTHORISATION TO PROCEED\n\nThis professional restoration estimate has been prepared for ${formData.clientName || 'the property owner'} following a comprehensive assessment of the property located at ${formData.propertyAddress}.\n\n${formData.insuranceCompany ? `INSURANCE INFORMATION:\nInsurance Company: ${formData.insuranceCompany}\n${formData.claimNumber ? `Claim Number: ${formData.claimNumber}\n` : ''}` : ''}\nLEGAL AND COMPLIANCE:\nThis scope of work has been prepared in accordance with ${formData.state} restoration industry standards, Work Health and Safety regulations, and relevant Australian Standards. All work will be performed by licensed, insured, and certified restoration technicians.\n\nURGENT RECOMMENDATION:\nProperty damage of this nature requires immediate professional restoration services to:\n• Prevent secondary damage and further deterioration\n• Mitigate health and safety risks to occupants\n• Minimise total restoration costs through prompt action\n• Comply with insurance policy requirements for timely mitigation\n\nWe strongly recommend immediate commencement of restoration services as outlined in this scope of work. Delays in restoration can result in increased damage severity, elevated costs, and potential insurance claim complications.\n\nPROFESSIONAL CERTIFICATION:\nRestoreAssist is a fully licensed and insured restoration company. Our technicians hold current IICRC certifications and maintain ongoing professional development. We carry comprehensive public liability insurance and workers compensation coverage.\n\nTo authorise commencement of restoration services, please review and approve this scope of work. Our team is prepared to mobilise immediately upon your authorisation.\n\nFor questions or clarifications regarding this restoration estimate, please contact our office.`,
    };

    // Store in localStorage to simulate backend storage
    const existingReports = JSON.parse(localStorage.getItem('mock_reports') || '[]');
    existingReports.push(mockReport);
    localStorage.setItem('mock_reports', JSON.stringify(existingReports));

    return mockReport;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Development mode: Check if we should use mock data
      const isDevelopment = !import.meta.env.PROD && window.location.hostname.includes('localhost');
      const useMockMode = isDevelopment && localStorage.getItem('accessToken')?.startsWith('dev-access-token');

      if (useMockMode) {
        // Generate mock report for screenshots/development
        console.log('🎭 DEV MODE: Generating mock report for screenshot capture');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
        generateMockReport(formData);
        onReportGenerated();
        console.log('✅ DEV MODE: Mock report generated successfully');
      } else {
        // Production mode: Use real backend API
        const apiKey = getStoredApiKey();
        if (!apiKey) {
          throw new Error('Please set your Anthropic API key first');
        }
        const report = await generateReport(formData);
        onReportGenerated();
      }

      // Reset form
      setFormData({
        propertyAddress: '',
        damageType: 'water',
        damageDescription: '',
        state: 'NSW',
        clientName: '',
        insuranceCompany: '',
        claimNumber: ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground p-6 rounded-lg shadow-md border border-border">
      <h2 className="text-2xl font-bold mb-4">Generate Damage Report</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Property Address *</label>
          <input
            type="text"
            required
            value={formData.propertyAddress}
            onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })}
            className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            placeholder="123 Main St, Sydney NSW 2000"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Damage Type *</label>
            <select
              required
              value={formData.damageType}
              onChange={(e) => setFormData({ ...formData, damageType: e.target.value as DamageType })}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            >
              <option value="water">Water Damage</option>
              <option value="fire">Fire Damage</option>
              <option value="storm">Storm Damage</option>
              <option value="flood">Flood Damage</option>
              <option value="mold">Mold Damage</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">State *</label>
            <select
              required
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value as AustralianState })}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            >
              <option value="NSW">NSW</option>
              <option value="VIC">VIC</option>
              <option value="QLD">QLD</option>
              <option value="WA">WA</option>
              <option value="SA">SA</option>
              <option value="TAS">TAS</option>
              <option value="ACT">ACT</option>
              <option value="NT">NT</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Damage Description *</label>
          <textarea
            required
            value={formData.damageDescription}
            onChange={(e) => setFormData({ ...formData, damageDescription: e.target.value })}
            className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            rows={4}
            placeholder="Describe the damage in detail..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client Name (Optional)</label>
          <input
            type="text"
            value={formData.clientName}
            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Insurance Company</label>
            <input
              type="text"
              value={formData.insuranceCompany}
              onChange={(e) => setFormData({ ...formData, insuranceCompany: e.target.value })}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Claim Number</label>
            <input
              type="text"
              value={formData.claimNumber}
              onChange={(e) => setFormData({ ...formData, claimNumber: e.target.value })}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating Report...' : 'Generate Report'}
        </button>
      </form>
    </div>
  );
}
