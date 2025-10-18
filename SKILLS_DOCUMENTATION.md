# RestoreAssist Anthropic Skills Integration

Complete documentation for the Anthropic Skills system integrated into RestoreAssist.

---

## Table of Contents

- [Overview](#overview)
- [What are Anthropic Skills?](#what-are-anthropic-skills)
- [Architecture](#architecture)
- [Skills Included](#skills-included)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [SDK Integration](#sdk-integration)
- [Management & Monitoring](#management--monitoring)
- [Creating New Skills](#creating-new-skills)
- [Troubleshooting](#troubleshooting)

---

## Overview

RestoreAssist integrates Anthropic's Skills API to enhance Claude's capabilities for generating professional, Australian-compliant damage assessment reports. Skills are automatically attached to every report generation request, ensuring consistent quality and compliance.

### Benefits

- **Enhanced Accuracy**: Skills provide domain-specific knowledge and standards
- **Compliance**: Automatic NCC 2022 and state regulation compliance
- **Consistency**: Every report follows professional industry standards
- **Market Accuracy**: Current 2024 Australian pricing and labor rates
- **Embedded Knowledge**: Always available, no manual prompting required

---

## What are Anthropic Skills?

Anthropic Skills are packages of specialized knowledge, examples, and instructions that enhance Claude's capabilities for specific tasks. They are created once and reused automatically across all relevant requests.

### Key Features

1. **Persistent Knowledge**: Skills are stored by Anthropic and reused
2. **Automatic Attachment**: Attached to API calls programmatically
3. **Version Control**: Skills have version numbers and can be updated
4. **Performance**: No context window overhead on requests
5. **Specialization**: Domain-specific expertise for better outputs

### vs. System Prompts

| Feature | Skills | System Prompts |
|---------|--------|----------------|
| Persistence | Stored by Anthropic | Sent every request |
| Context Usage | None | Uses context window |
| Complexity | Can be very large | Limited by tokens |
| Updates | Update once, affects all | Must update everywhere |
| Examples | Extensive examples | Limited examples |

---

## Architecture

### System Components

```
RestoreAssist Backend
├── services/
│   ├── skillsService.ts       # Skill management and initialization
│   └── claudeService.ts       # Claude API with skill attachment
├── skills/
│   └── documentation-generator/
│       ├── SKILL.md           # Main skill definition
│       ├── examples.json      # Sample inputs/outputs
│       ├── prompts.md         # Prompt engineering guide
│       └── README.md          # Skill documentation
└── routes/
    └── skillsRoutes.ts        # Skills API endpoints
```

### Data Flow

```
Client Request
    ↓
POST /api/reports (Generate Report)
    ↓
ReportRoutes → ClaudeService
    ↓
SkillsService.getDocumentationGeneratorSkillId()
    ↓
Anthropic API Call + Skill Attachment
    ↓
Enhanced Report Generation
    ↓
Response to Client
```

---

## Skills Included

### 1. Documentation Generator Skill

**Purpose**: Generate professional damage assessment reports for Australian restoration projects

**Capabilities**:
- Australian building standards (NCC 2022) compliance
- State-specific regulations (all 8 states/territories)
- Accurate cost estimation (2024 market rates)
- Professional formatting and terminology
- 5 damage types: water, fire, storm, flood, mold

**Files**:
- [SKILL.md](packages/backend/src/skills/documentation-generator/SKILL.md) - 400+ lines of standards, regulations, and guidelines
- [examples.json](packages/backend/src/skills/documentation-generator/examples.json) - 5 complete example reports
- [prompts.md](packages/backend/src/skills/documentation-generator/prompts.md) - Prompt engineering best practices

**Usage**: Automatically attached to all `POST /api/reports` requests

---

## How It Works

### 1. Initialization (Server Startup)

```typescript
// In skillsService.ts
class SkillsService {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.initializeSkills(); // Load or create skills
  }

  private async initializeSkills() {
    // Check if skill already exists
    const skillId = this.getSkillIdFromCache('documentation-generator');

    if (!skillId) {
      // Create new skill from files
      const skill = await this.createSkillFromDirectory({
        displayTitle: 'RestoreAssist Documentation Generator',
        description: 'AI-powered damage assessment report generator',
        skillPath: './skills/documentation-generator',
        version: '1.0.0',
        enabled: true
      });

      // Cache the skill ID
      this.saveSkillIdToCache('documentation-generator', skill.id);
    }
  }
}
```

### 2. Report Generation (Request Time)

```typescript
// In claudeService.ts
class ClaudeService {
  async generateReport(request: GenerateReportRequest) {
    const prompt = this.buildPrompt(request);

    // Get skill ID
    const skillId = skillsService.getDocumentationGeneratorSkillId();

    // Create message with skill attachment
    const message = await client.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 8000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
      skill_attachment: {
        type: 'skill',
        skill_id: skillId  // Skill is attached here!
      },
      betas: ['skills-2025-10-02']
    });

    // Track usage
    skillsService.incrementUsage('documentation-generator');

    return this.parseResponse(message.content[0].text, request);
  }
}
```

### 3. Skill Enhancement

Claude receives the request with enhanced knowledge:

1. **Request Prompt**: User's damage description
2. **Skill Knowledge**: NCC 2022, state regulations, cost data, examples
3. **Combined Processing**: Claude generates report using both
4. **Quality Output**: Professional, compliant, accurate report

---

## API Reference

### Skills Endpoints

#### `GET /api/skills`

List all available skills.

**Authentication**: Required

**Response**:
```json
{
  "skills": [
    {
      "id": "skill_xyz123",
      "displayTitle": "RestoreAssist Documentation Generator",
      "description": "AI-powered damage assessment report generator",
      "version": "1.0.0",
      "latestVersion": "1.0.0",
      "enabled": true,
      "createdAt": "2024-01-15T10:30:00Z",
      "lastUsed": "2024-01-15T14:22:00Z",
      "usageCount": 47
    }
  ],
  "total": 1
}
```

#### `GET /api/skills/stats`

Get skill usage statistics.

**Authentication**: Required (Admin only)

**Response**:
```json
{
  "totalSkills": 1,
  "enabledSkills": 1,
  "totalUsage": 47,
  "skillsByUsage": [
    {
      "name": "RestoreAssist Documentation Generator",
      "usage": 47
    }
  ]
}
```

#### `GET /api/skills/:skillName`

Get metadata for a specific skill.

**Authentication**: Required

**Response**:
```json
{
  "id": "skill_xyz123",
  "displayTitle": "RestoreAssist Documentation Generator",
  "description": "AI-powered damage assessment report generator",
  "version": "1.0.0",
  "latestVersion": "1.0.0",
  "enabled": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "lastUsed": "2024-01-15T14:22:00Z",
  "usageCount": 47
}
```

#### `PATCH /api/skills/:skillName/enable`

Enable or disable a skill.

**Authentication**: Required (Admin only)

**Request**:
```json
{
  "enabled": true
}
```

**Response**:
```json
{
  "message": "Skill enabled successfully",
  "skill": { /* skill metadata */ }
}
```

#### `GET /api/skills/health/status`

Check skills service health.

**Authentication**: Not required

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T14:30:00Z",
  "skillsLoaded": 1,
  "skillsEnabled": 1,
  "ready": true
}
```

---

## SDK Integration

### Automatic Skills Usage

When using the SDK, skills are automatically applied:

```typescript
import { RestoreAssistClient } from '@restoreassist/sdk';

const client = new RestoreAssistClient({
  baseUrl: 'http://localhost:3001/api',
  credentials: {
    email: 'user@example.com',
    password: 'password'
  }
});

// Skills are automatically used for report generation
const report = await client.reports.generate({
  propertyAddress: '123 Main St, Sydney NSW 2000',
  damageType: 'water',
  damageDescription: 'Burst pipe causing water damage',
  state: 'NSW'
});

// The generated report benefits from:
// - NCC 2022 compliance knowledge
// - NSW-specific building regulations
// - Accurate 2024 market pricing
// - Professional formatting
// - Industry-standard terminology
```

### Checking Skills Status

```typescript
// Check if skills are available
const health = await fetch('http://localhost:3001/api/skills/health/status');
const status = await health.json();

if (status.ready) {
  console.log(`Skills ready: ${status.skillsEnabled} enabled`);
}

// Get skill statistics (admin only)
const stats = await client.get('/api/skills/stats');
console.log('Total skill usage:', stats.totalUsage);
```

---

## Management & Monitoring

### Viewing Skills

```bash
# List all skills
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/skills

# Get skill statistics
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3001/api/skills/stats

# Check health
curl http://localhost:3001/api/skills/health/status
```

### Server Logs

Skills initialization is logged on server startup:

```
🎯 Initializing Anthropic Skills...
  Loading 3 file(s) for skill: RestoreAssist Documentation Generator
    - SKILL.md
    - examples.json
    - prompts.md
✅ Created Documentation Generator Skill: skill_xyz123
✅ Skills initialized: 1 skill(s) loaded

📚 Available Skills:
  - RestoreAssist Documentation Generator (skill_xyz123)
    Version: 1.0.0 | Enabled: true | Usage: 0

✅ Anthropic Skills service ready (1/1 skills enabled)
```

Report generation logs show skill usage:

```
🎯 Using Documentation Generator Skill: skill_xyz123
```

### Disabling Skills

Skills can be disabled without removing them:

```bash
curl -X PATCH \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' \
  http://localhost:3001/api/skills/documentation-generator/enable
```

When disabled, reports will be generated without skill enhancement (falling back to standard prompts).

---

## Creating New Skills

### 1. Create Skill Directory

```bash
mkdir -p packages/backend/src/skills/my-new-skill
```

### 2. Create SKILL.md

The main skill definition file:

```markdown
# My New Skill

## Overview
Description of what this skill does

## Purpose
Specific use case

## Capabilities
- Capability 1
- Capability 2

## Input Requirements
Expected input format

## Output Format
Expected output structure

## Examples
Sample inputs and outputs
```

### 3. Add Supporting Files

- **examples.json**: Sample data
- **prompts.md**: Prompt engineering guidelines
- **README.md**: Skill documentation

### 4. Register Skill

Update `skillsService.ts`:

```typescript
private async initializeSkills() {
  // Existing skills...

  // Add new skill
  await this.ensureMyNewSkill();
}

private async ensureMyNewSkill() {
  const skillPath = path.join(this.skillsBasePath, 'my-new-skill');
  // ... similar to ensureDocumentationGeneratorSkill()
}
```

### 5. Attach to API Calls

Update the relevant service to attach the skill:

```typescript
const skillId = skillsService.getMyNewSkillId();

const message = await client.messages.create({
  // ... other params
  skill_attachment: {
    type: 'skill',
    skill_id: skillId
  },
  betas: ['skills-2025-10-02']
});
```

---

## Troubleshooting

### Skill Not Loading

**Symptoms**: Server logs show skill initialization errors

**Solutions**:
1. Verify `ANTHROPIC_API_KEY` is set in `.env.local`
2. Check skill files exist in correct directory
3. Ensure SKILL.md has valid content
4. Review Anthropic API limits and quotas

**Check**:
```bash
GET /api/skills/health/status
```

### Reports Not Using Skills

**Symptoms**: Reports don't show enhanced quality

**Solutions**:
1. Check skill is enabled: `GET /api/skills`
2. Review server logs for skill attachment messages
3. Verify skill ID is not null
4. Confirm `skills-2025-10-02` beta is available

**Debug**:
```typescript
const skillId = skillsService.getDocumentationGeneratorSkillId();
console.log('Skill ID:', skillId); // Should not be null
```

### Skill Cache Issues

**Symptoms**: Changes to skill files not reflected

**Solutions**:
1. Delete `.skill-cache.json` in skills directory
2. Restart backend server
3. New skill version will be created

```bash
rm packages/backend/src/skills/.skill-cache.json
npm run dev:backend
```

### API Errors

**Symptoms**: `400` or `500` errors from Anthropic API

**Solutions**:
1. Verify API key has skills beta access
2. Check file sizes (max 25MB total per skill)
3. Validate SKILL.md markdown syntax
4. Review Anthropic API status

**Check API Key**:
```bash
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

---

## Best Practices

### 1. Skill Design

- **Focus**: One skill per domain/task
- **Size**: Keep skill files concise but comprehensive
- **Examples**: Include diverse, high-quality examples
- **Updates**: Version skills and track changes

### 2. File Organization

```
skills/
└── skill-name/
    ├── SKILL.md          # Main definition (required)
    ├── examples.json     # Sample data
    ├── prompts.md        # Prompt guidance
    ├── README.md         # Documentation
    └── data/            # Additional resources
        ├── standards.md
        └── pricing.json
```

### 3. Content Guidelines

- **Accuracy**: Verify all facts and data
- **Currency**: Update regularly (quarterly for pricing)
- **Compliance**: Reference current standards/regulations
- **Clarity**: Use clear, professional language
- **Structure**: Organize information logically

### 4. Testing

- **Create**: Generate reports and verify quality
- **Compare**: Test with and without skill
- **Monitor**: Track usage statistics
- **Update**: Improve based on feedback

### 5. Monitoring

```typescript
// Log skill usage
skillsService.incrementUsage('skill-name');

// Review statistics
const stats = skillsService.getSkillStats();
console.log('Usage by skill:', stats.skillsByUsage);

// Check last used
const skill = skillsService.getSkillMetadata('skill-name');
console.log('Last used:', skill.lastUsed);
```

---

## Resources

- **Anthropic Skills API**: https://docs.anthropic.com/claude/docs/skills
- **RestoreAssist Documentation**: [README.md](README.md)
- **Skill Definition**: [packages/backend/src/skills/documentation-generator/SKILL.md](packages/backend/src/skills/documentation-generator/SKILL.md)
- **Skills Service**: [packages/backend/src/services/skillsService.ts](packages/backend/src/services/skillsService.ts)

---

## Support

For issues or questions:

1. Check server logs: `npm run dev:backend`
2. Review skill health: `GET /api/skills/health/status`
3. Verify skill metadata: `GET /api/skills/:skillName`
4. Check Anthropic API status: https://status.anthropic.com

---

**Built with Anthropic Skills API** 🎯
