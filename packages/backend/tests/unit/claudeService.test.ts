/**
 * Unit Tests: Claude AI Service
 *
 * Tests AI-powered disaster restoration report generation.
 *
 * Coverage:
 * - Report generation with various damage types
 * - Australian state compliance standards
 * - Prompt building and request formatting
 * - Response parsing and validation
 * - Error handling for invalid responses
 * - JSON parsing edge cases
 * - Skills service integration
 * - Cost calculation accuracy
 *
 * @module services/claudeService.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClaudeService } from '../../src/services/claudeService';
import type { GenerateReportRequest, GeneratedReport } from '../../src/types';

// Mock Anthropic SDK
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Mock skills service
const mockGetSkillId = jest.fn();
const mockIncrementUsage = jest.fn();

jest.mock('../../src/services/skillsService', () => ({
  skillsService: {
    getDocumentationGeneratorSkillId: mockGetSkillId,
    incrementUsage: mockIncrementUsage,
  },
}));

describe('Claude Service', () => {
  let claudeService: ClaudeService;

  beforeEach(() => {
    jest.clearAllMocks();
    claudeService = new ClaudeService();
    process.env.ANTHROPIC_API_KEY = 'test-api-key-12345';
  });

  describe('generateReport - Water Damage', () => {
    it('should generate report for water damage in NSW', async () => {
      const mockResponse = {
        summary: 'Significant water damage to kitchen and living areas from burst pipe.',
        scopeOfWork: [
          'Water extraction and drying',
          'Remove damaged flooring',
          'Repair plasterboard walls',
          'Mould remediation',
        ],
        itemizedEstimate: [
          {
            description: 'Water extraction (industrial equipment)',
            quantity: 1,
            unitCost: 850.0,
            totalCost: 850.0,
            category: 'Equipment',
          },
          {
            description: 'Remove and dispose damaged carpet',
            quantity: 25,
            unitCost: 35.0,
            totalCost: 875.0,
            category: 'Labor',
          },
          {
            description: 'Plasterboard repair',
            quantity: 15,
            unitCost: 65.0,
            totalCost: 975.0,
            category: 'Materials',
          },
        ],
        complianceNotes: [
          'Work must comply with NSW Building Code',
          'Asbestos inspection required for pre-1990 buildings',
        ],
        authorityToProceed:
          'I authorize RestoreAssist to proceed with the restoration work as outlined.',
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: '123 Main St, Sydney NSW 2000',
        state: 'NSW',
        damageType: 'water',
        damageDescription: 'Burst pipe in kitchen, water flooded living area',
        clientName: 'John Smith',
        insuranceCompany: 'NRMA Insurance',
        claimNumber: 'CLM-2025-1234',
      };

      const report = await claudeService.generateReport(request);

      expect(report).toBeDefined();
      expect(report.reportId).toMatch(/^RPT-\d+-/);
      expect(report.propertyAddress).toBe('123 Main St, Sydney NSW 2000');
      expect(report.damageType).toBe('water');
      expect(report.state).toBe('NSW');
      expect(report.summary).toContain('water damage');
      expect(report.scopeOfWork).toHaveLength(4);
      expect(report.itemizedEstimate).toHaveLength(3);
      expect(report.totalCost).toBe(2700.0);
      expect(report.complianceNotes).toContain('NSW Building Code');
      expect(report.metadata.clientName).toBe('John Smith');
      expect(report.metadata.insuranceCompany).toBe('NRMA Insurance');
    });
  });

  describe('generateReport - Fire Damage', () => {
    it('should generate report for fire damage in VIC', async () => {
      const mockResponse = {
        summary: 'Severe fire damage to kitchen and adjacent rooms.',
        scopeOfWork: [
          'Structural assessment',
          'Smoke and soot cleaning',
          'Replace burnt cabinetry',
          'Electrical rewiring',
        ],
        itemizedEstimate: [
          {
            description: 'Structural engineer assessment',
            quantity: 1,
            unitCost: 1200.0,
            totalCost: 1200.0,
            category: 'Labor',
          },
          {
            description: 'Smoke cleaning and deodorization',
            quantity: 40,
            unitCost: 45.0,
            totalCost: 1800.0,
            category: 'Labor',
          },
        ],
        complianceNotes: ['Victorian Building Regulations apply', 'Fire safety inspection required'],
        authorityToProceed: 'Authorization to proceed with fire restoration work.',
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: '456 Fire Rd, Melbourne VIC 3000',
        state: 'VIC',
        damageType: 'fire',
        damageDescription: 'Kitchen fire spread to living room',
      };

      const report = await claudeService.generateReport(request);

      expect(report.damageType).toBe('fire');
      expect(report.state).toBe('VIC');
      expect(report.totalCost).toBe(3000.0);
      expect(report.complianceNotes).toContain('Victorian Building Regulations apply');
    });
  });

  describe('generateReport - Mould Damage', () => {
    it('should generate report for mould remediation in QLD', async () => {
      const mockResponse = {
        summary: 'Extensive mould growth due to prolonged moisture exposure.',
        scopeOfWork: [
          'Mould inspection and testing',
          'Containment setup',
          'Mould removal',
          'HEPA air filtration',
        ],
        itemizedEstimate: [
          {
            description: 'Mould inspection and air quality testing',
            quantity: 1,
            unitCost: 650.0,
            totalCost: 650.0,
            category: 'Labor',
          },
          {
            description: 'Containment barriers and negative air pressure',
            quantity: 1,
            unitCost: 850.0,
            totalCost: 850.0,
            category: 'Equipment',
          },
        ],
        complianceNotes: ['Queensland Building Code compliance required'],
        authorityToProceed: 'Authorization for mould remediation work.',
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: '789 Mold Ave, Brisbane QLD 4000',
        state: 'QLD',
        damageType: 'mold',
        damageDescription: 'Black mold in bathroom and bedroom',
      };

      const report = await claudeService.generateReport(request);

      expect(report.damageType).toBe('mold');
      expect(report.state).toBe('QLD');
      expect(report.totalCost).toBe(1500.0);
    });
  });

  describe('generateReport - Storm Damage', () => {
    it('should generate report for storm damage in WA', async () => {
      const mockResponse = {
        summary: 'Storm damage including roof damage and water ingress.',
        scopeOfWork: [
          'Roof tarpauling (emergency)',
          'Structural inspection',
          'Roof tile replacement',
          'Gutter repairs',
        ],
        itemizedEstimate: [
          {
            description: 'Emergency roof tarpauling',
            quantity: 1,
            unitCost: 950.0,
            totalCost: 950.0,
            category: 'Labor',
          },
        ],
        complianceNotes: ['WA Building Regulations apply'],
        authorityToProceed: 'Authorization for storm damage repairs.',
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: '101 Storm St, Perth WA 6000',
        state: 'WA',
        damageType: 'storm',
        damageDescription: 'Roof tiles blown off, water entering ceiling',
      };

      const report = await claudeService.generateReport(request);

      expect(report.damageType).toBe('storm');
      expect(report.state).toBe('WA');
      expect(report.totalCost).toBe(950.0);
    });
  });

  describe('Prompt Building', () => {
    it('should include all property details in prompt', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Test',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'Test',
            }),
          },
        ],
      });

      const request: GenerateReportRequest = {
        propertyAddress: '999 Test St',
        state: 'SA',
        damageType: 'water',
        damageDescription: 'Test damage',
        clientName: 'Test Client',
        insuranceCompany: 'Test Insurance',
        claimNumber: 'CLM-TEST-999',
      };

      await claudeService.generateReport(request);

      const calledPrompt = (mockCreate.mock.calls[0][0] as any).messages[0].content;

      expect(calledPrompt).toContain('999 Test St');
      expect(calledPrompt).toContain('SA');
      expect(calledPrompt).toContain('other');
      expect(calledPrompt).toContain('Test damage');
      expect(calledPrompt).toContain('Test Client');
      expect(calledPrompt).toContain('Test Insurance');
      expect(calledPrompt).toContain('CLM-TEST-999');
      expect(calledPrompt).toContain('SA Development Regulations + NCC 2022');
    });

    it('should include correct state compliance standards', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Test',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'Test',
            }),
          },
        ],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'TAS',
        damageType: 'water',
        damageDescription: 'Test',
      };

      await claudeService.generateReport(request);

      const calledPrompt = (mockCreate.mock.calls[0][0] as any).messages[0].content;
      expect(calledPrompt).toContain('Tasmanian Building Regulations + NCC 2022');
    });
  });

  describe('Response Parsing', () => {
    it('should parse clean JSON response', async () => {
      const mockResponse = {
        summary: 'Clean JSON response',
        scopeOfWork: ['Step 1', 'Step 2'],
        itemizedEstimate: [
          {
            description: 'Item 1',
            quantity: 1,
            unitCost: 100.0,
            totalCost: 100.0,
            category: 'Labor',
          },
        ],
        complianceNotes: ['Note 1'],
        authorityToProceed: 'ATP text',
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'NSW',
        damageType: 'water',
        damageDescription: 'Test',
      };

      const report = await claudeService.generateReport(request);

      expect(report.summary).toBe('Clean JSON response');
      expect(report.totalCost).toBe(100.0);
    });

    it('should strip markdown code blocks from response', async () => {
      const mockResponse = {
        summary: 'Markdown wrapped response',
        scopeOfWork: ['Step 1'],
        itemizedEstimate: [
          {
            description: 'Item',
            quantity: 1,
            unitCost: 50.0,
            totalCost: 50.0,
            category: 'Labor',
          },
        ],
        complianceNotes: [],
        authorityToProceed: 'ATP',
      };

      const markdownWrapped = '```json\n' + JSON.stringify(mockResponse) + '\n```';

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: markdownWrapped }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'VIC',
        damageType: 'fire',
        damageDescription: 'Test',
      };

      const report = await claudeService.generateReport(request);

      expect(report.summary).toBe('Markdown wrapped response');
    });

    it('should calculate total cost from itemized estimate', async () => {
      const mockResponse = {
        summary: 'Multi-item estimate',
        scopeOfWork: ['Step 1'],
        itemizedEstimate: [
          {
            description: 'Item 1',
            quantity: 2,
            unitCost: 100.0,
            totalCost: 200.0,
            category: 'Labor',
          },
          {
            description: 'Item 2',
            quantity: 3,
            unitCost: 50.0,
            totalCost: 150.0,
            category: 'Materials',
          },
          {
            description: 'Item 3',
            quantity: 1,
            unitCost: 300.0,
            totalCost: 300.0,
            category: 'Equipment',
          },
        ],
        complianceNotes: [],
        authorityToProceed: 'ATP',
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'QLD',
        damageType: 'water',
        damageDescription: 'Test',
      };

      const report = await claudeService.generateReport(request);

      expect(report.totalCost).toBe(650.0); // 200 + 150 + 300
    });

    it('should throw error for invalid JSON response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'This is not valid JSON' }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'NSW',
        damageType: 'water',
        damageDescription: 'Test',
      };

      await expect(claudeService.generateReport(request)).rejects.toThrow(
        'Failed to generate valid report'
      );
    });

    it('should throw error for malformed JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{ summary: "Missing quotes" }' }],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'VIC',
        damageType: 'fire',
        damageDescription: 'Test',
      };

      await expect(claudeService.generateReport(request)).rejects.toThrow(
        'Failed to generate valid report'
      );
    });
  });

  describe('Skills Service Integration', () => {
    it('should use skill attachment when available', async () => {
      mockGetSkillId.mockReturnValueOnce('skill-doc-gen-123');

      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'With skill',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'ATP',
            }),
          },
        ],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'NSW',
        damageType: 'water',
        damageDescription: 'Test',
      };

      await claudeService.generateReport(request);

      expect(mockGetSkillId).toHaveBeenCalled();
      expect(mockIncrementUsage).toHaveBeenCalledWith('documentation-generator');

      const messageConfig = mockCreate.mock.calls[0][0] as any;
      expect(messageConfig.skill_attachment).toEqual({
        type: 'skill',
        skill_id: 'skill-doc-gen-123',
      });
      expect(messageConfig.betas).toContain('skills-2025-10-02');
    });

    it('should work without skill when not available', async () => {
      mockGetSkillId.mockReturnValueOnce(null);

      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Without skill',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'ATP',
            }),
          },
        ],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'QLD',
        damageType: 'mold',
        damageDescription: 'Test',
      };

      await claudeService.generateReport(request);

      const messageConfig = mockCreate.mock.calls[0][0] as any;
      expect(messageConfig.skill_attachment).toBeUndefined();
      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });
  });

  describe('Report Metadata', () => {
    it('should include generation metadata', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Test',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'ATP',
            }),
          },
        ],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'NSW',
        damageType: 'water',
        damageDescription: 'Test',
        clientName: 'Meta Client',
        insuranceCompany: 'Meta Insurance',
        claimNumber: 'CLM-META-123',
      };

      const report = await claudeService.generateReport(request);

      expect(report.metadata).toBeDefined();
      expect(report.metadata.clientName).toBe('Meta Client');
      expect(report.metadata.insuranceCompany).toBe('Meta Insurance');
      expect(report.metadata.claimNumber).toBe('CLM-META-123');
      expect(report.metadata.generatedBy).toBe('RestoreAssist AI');
      expect(report.metadata.model).toBe('claude-opus-4-20250514');
    });

    it('should set timestamp to current time', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Test',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'ATP',
            }),
          },
        ],
      });

      const before = new Date();

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'VIC',
        damageType: 'fire',
        damageDescription: 'Test',
      };

      const report = await claudeService.generateReport(request);

      const after = new Date();

      const reportTime = new Date(report.timestamp);
      expect(reportTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(reportTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('API Configuration', () => {
    it('should use correct Claude model', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Test',
              scopeOfWork: [],
              itemizedEstimate: [],
              complianceNotes: [],
              authorityToProceed: 'ATP',
            }),
          },
        ],
      });

      const request: GenerateReportRequest = {
        propertyAddress: 'Test',
        state: 'NSW',
        damageType: 'water',
        damageDescription: 'Test',
      };

      await claudeService.generateReport(request);

      const messageConfig = mockCreate.mock.calls[0][0] as any;
      expect(messageConfig.model).toBe('claude-opus-4-20250514');
      expect(messageConfig.max_tokens).toBe(8000);
      expect(messageConfig.temperature).toBe(0.3);
    });
  });
});
