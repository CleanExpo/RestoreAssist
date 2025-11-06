---
title: RestoreAssist Orchestrator Build Plan
version: 1.0.0
type: implementation-specification
project: RestoreAssist
created: 2025-11-05
---

# RestoreAssist Orchestrator Implementation Build Plan

## Overview

This document provides detailed specifications for building the RestoreAssist Skills Orchestrator in three progressive phases. Each phase includes specific components, acceptance criteria, and integration checkpoints.

## Phase 1: Foundation Layer (Weeks 1-3)

### 1.1 Authentication & User Management

#### Components to Build

```typescript
// File: app/api/auth/enhanced/route.ts
interface AuthenticationSystem {
  providers: ['credentials', 'google', 'microsoft'];
  features: {
    mfa: boolean;
    passwordPolicy: PasswordRules;
    sessionManagement: SessionConfig;
    auditLogging: boolean;
  };
  rbac: {
    roles: ['USER', 'MANAGER', 'ADMIN', 'AUDITOR'];
    permissions: PermissionSet;
  };
}
```

#### Acceptance Criteria

- [ ] Users can register with email/password
- [ ] OAuth providers configured and working
- [ ] Password meets complexity requirements (8+ chars, mixed case, number, special)
- [ ] Session timeout after 30 minutes of inactivity
- [ ] Role-based access control implemented
- [ ] Audit log captures all auth events
- [ ] Email verification workflow complete
- [ ] Password reset functionality working

#### Database Schema Updates

```sql
-- Enhanced User model additions
ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "loginAttempts" INTEGER DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP;
```

### 1.2 API Key Management (BYOK)

#### Components to Build

```typescript
// File: lib/api-key-manager.ts
interface ApiKeyManager {
  encryption: {
    algorithm: 'AES-256-GCM';
    keyDerivation: 'PBKDF2';
    iterations: 100000;
  };
  validation: {
    checkFormat(): boolean;
    testConnection(): Promise<boolean>;
    getRateLimit(): Promise<RateLimit>;
  };
  storage: {
    encrypt(key: string): Promise<EncryptedKey>;
    decrypt(encrypted: EncryptedKey): Promise<string>;
    rotate(): Promise<void>;
  };
}
```

#### Acceptance Criteria

- [ ] API keys encrypted before storage
- [ ] Encryption keys properly managed (env variable)
- [ ] Key validation endpoint working
- [ ] Rate limit checking implemented
- [ ] Key rotation mechanism in place
- [ ] Audit trail for key usage
- [ ] Secure key input UI (masked, copy protection)
- [ ] Key testing functionality

#### Integration Tests

```typescript
// File: tests/api-key-manager.test.ts
describe('API Key Manager', () => {
  test('encrypts and decrypts keys correctly');
  test('validates Anthropic API key format');
  test('handles invalid keys gracefully');
  test('tracks usage and rate limits');
  test('prevents key extraction from UI');
});
```

### 1.3 Database Foundation

#### Components to Build

```typescript
// File: lib/database/orchestrator-schema.ts
interface OrchestratorSchema {
  models: {
    Workflow: WorkflowModel;
    SkillExecution: SkillExecutionModel;
    AgentState: AgentStateModel;
    AuditLog: AuditLogModel;
  };
  migrations: {
    addOrchestratorTables: Migration;
    addIndexes: Migration;
    addTriggers: Migration;
  };
}
```

#### Prisma Schema Additions

```prisma
model Workflow {
  id          String   @id @default(cuid())
  name        String
  version     String
  config      Json
  status      WorkflowStatus
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  executions  WorkflowExecution[]
}

model WorkflowExecution {
  id          String   @id @default(cuid())
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id])
  reportId    String?
  report      Report?  @relation(fields: [reportId], references: [id])
  status      ExecutionStatus
  startedAt   DateTime @default(now())
  completedAt DateTime?
  result      Json?
  error       Json?
  skills      SkillExecution[]
}

model SkillExecution {
  id            String   @id @default(cuid())
  executionId   String
  execution     WorkflowExecution @relation(fields: [executionId], references: [id])
  skillName     String
  skillVersion  String
  input         Json
  output        Json?
  status        SkillStatus
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  duration      Int?
  retryCount    Int      @default(0)
  error         Json?
}
```

#### Acceptance Criteria

- [ ] All Prisma migrations successful
- [ ] Database indexes optimized
- [ ] Backup strategy implemented
- [ ] Connection pooling configured
- [ ] Transaction handling tested
- [ ] Soft delete functionality
- [ ] Audit triggers working
- [ ] Performance baseline established

### 1.4 Compliance Engine Foundation

#### Components to Build

```typescript
// File: lib/compliance/iicrc-engine.ts
interface ComplianceEngine {
  standards: {
    S500: WaterDamageStandard;
    S520: MoldRemediationStandard;
  };
  validators: {
    checkRequiredFields(data: any, standard: string): ValidationResult;
    validateCalculations(data: any): ValidationResult;
    verifyDocumentation(report: Report): ComplianceScore;
  };
  reporting: {
    generateComplianceReport(): ComplianceReport;
    flagViolations(): Violation[];
  };
}
```

#### Acceptance Criteria

- [ ] IICRC S500 rules implemented
- [ ] IICRC S520 rules implemented
- [ ] Validation API endpoints working
- [ ] Compliance scoring algorithm tested
- [ ] Violation reporting functional
- [ ] Remediation suggestions provided
- [ ] Compliance dashboard available
- [ ] Audit trail maintained

## Phase 2: Orchestrator Core (Weeks 4-7)

### 2.1 Workflow Management System

#### Components to Build

```typescript
// File: lib/orchestrator/workflow-manager.ts
interface WorkflowManager {
  definition: {
    phases: Phase[];
    transitions: Transition[];
    conditions: Condition[];
  };
  execution: {
    start(workflowId: string, context: Context): Execution;
    pause(executionId: string): void;
    resume(executionId: string): void;
    cancel(executionId: string): void;
  };
  monitoring: {
    getStatus(executionId: string): Status;
    getMetrics(): Metrics;
    subscribe(event: string, callback: Function): void;
  };
}
```

#### Workflow Definitions

```yaml
# File: workflows/restoration-report.yaml
name: Standard Restoration Report
version: 1.0.0
phases:
  - id: initiation
    skills:
      - client_validator
      - project_initializer
      - compliance_checker
    transitions:
      - to: assessment
        condition: all_skills_success

  - id: assessment
    skills:
      - damage_categorizer
      - measurement_calculator
      - photo_analyzer
    parallel: true
    transitions:
      - to: documentation
        condition: required_data_collected

  - id: documentation
    skills:
      - report_generator
      - estimate_builder
      - scope_writer
    transitions:
      - to: review
        condition: documents_generated

  - id: review
    skills:
      - compliance_validator
      - quality_checker
    transitions:
      - to: delivery
        condition: approved
      - to: assessment
        condition: needs_revision

  - id: delivery
    skills:
      - document_packager
      - email_sender
      - archive_manager
```

#### Acceptance Criteria

- [ ] Workflow YAML parser working
- [ ] State machine implementation complete
- [ ] Parallel execution supported
- [ ] Conditional transitions working
- [ ] Rollback mechanism implemented
- [ ] Progress tracking accurate
- [ ] Error recovery functional
- [ ] Workflow versioning supported

### 2.2 Agent Coordination System

#### Components to Build

```typescript
// File: lib/orchestrator/agent-coordinator.ts
interface AgentCoordinator {
  agents: {
    register(agent: Agent): string;
    unregister(agentId: string): void;
    getStatus(agentId: string): AgentStatus;
  };
  tasks: {
    assign(task: Task, agentId: string): void;
    redistribute(task: Task): void;
    prioritize(tasks: Task[]): Task[];
  };
  communication: {
    broadcast(message: Message): void;
    send(agentId: string, message: Message): void;
    subscribe(channel: string, handler: Handler): void;
  };
  loadBalancing: {
    algorithm: 'round-robin' | 'least-loaded' | 'priority';
    healthCheck(): HealthStatus[];
    rebalance(): void;
  };
}
```

#### Agent Definitions

```typescript
// File: agents/damage-assessment-agent.ts
class DamageAssessmentAgent extends BaseAgent {
  skills = [
    'water_categorization',
    'material_identification',
    'moisture_mapping',
    'photo_analysis'
  ];

  async process(input: AssessmentInput): Promise<AssessmentOutput> {
    // Validate input
    this.validate(input);

    // Execute skills in sequence
    const category = await this.categorizeWater(input);
    const materials = await this.identifyMaterials(input);
    const moisture = await this.mapMoisture(input);
    const analysis = await this.analyzePhotos(input);

    // Compile results
    return this.compileAssessment({
      category,
      materials,
      moisture,
      analysis
    });
  }
}
```

#### Acceptance Criteria

- [ ] Agent registration system working
- [ ] Task queue implementation complete
- [ ] Load balancing functional
- [ ] Health monitoring active
- [ ] Communication channels established
- [ ] Error propagation handled
- [ ] Agent scaling supported
- [ ] Performance metrics collected

### 2.3 Skill Registry & Management

#### Components to Build

```typescript
// File: lib/orchestrator/skill-registry.ts
interface SkillRegistry {
  registration: {
    register(skill: Skill): void;
    update(skillId: string, skill: Skill): void;
    deprecate(skillId: string): void;
  };
  discovery: {
    find(criteria: Criteria): Skill[];
    getCompatible(context: Context): Skill[];
    resolveDependencies(skill: Skill): Skill[];
  };
  execution: {
    invoke(skillId: string, input: any): Promise<any>;
    chain(skills: Skill[], input: any): Promise<any>;
    parallel(skills: Skill[], input: any): Promise<any[]>;
  };
  versioning: {
    getVersion(skillId: string): string;
    upgrade(skillId: string, version: string): void;
    rollback(skillId: string): void;
  };
}
```

#### Skill Implementation Template

```typescript
// File: skills/base-skill.ts
abstract class BaseSkill {
  abstract readonly id: string;
  abstract readonly version: string;
  abstract readonly dependencies: string[];
  abstract readonly compliance: string[];

  protected logger: Logger;
  protected metrics: MetricsCollector;
  protected cache: Cache;

  async execute(input: any, context: Context): Promise<any> {
    const startTime = Date.now();

    try {
      // Pre-execution validation
      await this.validate(input);

      // Check cache
      const cached = await this.checkCache(input);
      if (cached) return cached;

      // Execute skill logic
      const result = await this.process(input, context);

      // Post-execution validation
      await this.validateOutput(result);

      // Cache result
      await this.cacheResult(input, result);

      // Record metrics
      this.recordMetrics(startTime);

      return result;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  abstract validate(input: any): Promise<void>;
  abstract process(input: any, context: Context): Promise<any>;
  abstract validateOutput(output: any): Promise<void>;
}
```

#### Acceptance Criteria

- [ ] Skill registration functional
- [ ] Dependency resolution working
- [ ] Version management implemented
- [ ] Skill chaining supported
- [ ] Parallel execution working
- [ ] Caching mechanism active
- [ ] Metrics collection functional
- [ ] Error handling robust

### 2.4 State Management System

#### Components to Build

```typescript
// File: lib/orchestrator/state-manager.ts
interface StateManager {
  storage: {
    save(state: State): Promise<void>;
    load(id: string): Promise<State>;
    update(id: string, patch: Partial<State>): Promise<void>;
  };
  history: {
    track(state: State): void;
    getHistory(id: string): State[];
    rollback(id: string, version: number): void;
  };
  synchronization: {
    lock(resource: string): Promise<Lock>;
    unlock(lock: Lock): void;
    subscribe(id: string, callback: Callback): void;
  };
  recovery: {
    checkpoint(state: State): void;
    restore(checkpointId: string): State;
    cleanup(): void;
  };
}
```

#### Acceptance Criteria

- [ ] State persistence working
- [ ] State history tracked
- [ ] Optimistic locking implemented
- [ ] Real-time sync functional
- [ ] Checkpoint/restore working
- [ ] State compression active
- [ ] Garbage collection functional
- [ ] Performance optimized

## Phase 3: Feature Implementation (Weeks 8-12)

### 3.1 Advanced Report Generation

#### Components to Build

```typescript
// File: lib/features/report-generator-v2.ts
interface AdvancedReportGenerator {
  templates: {
    load(templateId: string): Template;
    customize(template: Template, options: Options): Template;
    validate(template: Template): boolean;
  };
  generation: {
    analyze(input: ReportInput): Analysis;
    generate(analysis: Analysis, template: Template): Document;
    enhance(document: Document): Document;
  };
  ai: {
    generateSummary(data: any): string;
    extractKeyPoints(text: string): string[];
    suggestRecommendations(analysis: Analysis): string[];
  };
  formatting: {
    applyStyles(document: Document): StyledDocument;
    addCharts(document: Document, data: ChartData[]): Document;
    embedPhotos(document: Document, photos: Photo[]): Document;
  };
}
```

#### Report Templates

```yaml
# File: templates/iicrc-s500-report.yaml
name: IICRC S500 Compliant Water Damage Report
sections:
  - executive_summary:
      ai_generated: true
      max_length: 500
      key_points: auto

  - property_information:
      fields:
        - address
        - owner_name
        - insurance_carrier
        - claim_number
        - date_of_loss

  - initial_assessment:
      subsections:
        - water_source
        - affected_areas
        - category_determination
        - class_determination
        - safety_hazards

  - detailed_findings:
      room_by_room: true
      include_photos: true
      moisture_readings: required

  - scope_of_work:
      format: itemized
      include_equipment: true
      labor_hours: estimated

  - drying_plan:
      psychrometric_calculations: required
      equipment_placement: diagram
      monitoring_schedule: daily

  - cost_estimate:
      format: detailed
      include_tax: true
      payment_terms: standard
```

#### Acceptance Criteria

- [ ] Template system functional
- [ ] AI integration working
- [ ] IICRC compliance validated
- [ ] Photo embedding functional
- [ ] Chart generation working
- [ ] PDF export quality verified
- [ ] Multi-format export supported
- [ ] Performance optimized (<5s generation)

### 3.2 Intelligent Estimate Creation

#### Components to Build

```typescript
// File: lib/features/estimate-builder-v2.ts
interface IntelligentEstimateBuilder {
  pricing: {
    database: PricingDatabase;
    adjustments: RegionalAdjustments;
    modifiers: PriceModifiers;
  };
  calculation: {
    materials(items: Item[]): MaterialCost;
    labor(hours: number, rate: number): LaborCost;
    equipment(days: number, items: Equipment[]): EquipmentCost;
    overhead(subtotal: number): number;
    profit(subtotal: number): number;
  };
  optimization: {
    suggestBundling(items: Item[]): Bundle[];
    findAlternatives(item: Item): Item[];
    validatePricing(estimate: Estimate): Validation;
  };
  export: {
    toXactimate(): XactimateFormat;
    toExcel(): ExcelWorkbook;
    toPDF(): PDFDocument;
  };
}
```

#### Acceptance Criteria

- [ ] Pricing database populated
- [ ] Regional adjustments configured
- [ ] Calculation engine accurate
- [ ] Bundle suggestions working
- [ ] Xactimate export validated
- [ ] Excel formatting correct
- [ ] PDF generation functional
- [ ] Approval workflow integrated

### 3.3 Dynamic Scope Development

#### Components to Build

```typescript
// File: lib/features/scope-developer.ts
interface ScopeDeveloper {
  analysis: {
    assessDamage(input: DamageInput): DamageAssessment;
    determineTasks(assessment: DamageAssessment): Task[];
    prioritizeTasks(tasks: Task[]): Task[];
  };
  generation: {
    createScope(tasks: Task[]): Scope;
    addDetails(scope: Scope): DetailedScope;
    validateCompleteness(scope: Scope): Validation;
  };
  customization: {
    adjustForClient(scope: Scope, preferences: ClientPreferences): Scope;
    adjustForInsurance(scope: Scope, carrier: string): Scope;
    addSupplemental(scope: Scope, items: Item[]): Scope;
  };
}
```

#### Acceptance Criteria

- [ ] Damage analysis accurate
- [ ] Task generation comprehensive
- [ ] Priority algorithm tested
- [ ] Scope formatting standard
- [ ] Client customization working
- [ ] Insurance adjustments functional
- [ ] Supplemental handling complete
- [ ] Version control implemented

### 3.4 Integration Hub

#### Components to Build

```typescript
// File: lib/integrations/hub.ts
interface IntegrationHub {
  connectors: {
    xactimate: XactimateConnector;
    docusign: DocusignConnector;
    quickbooks: QuickbooksConnector;
    google: GoogleWorkspaceConnector;
  };
  sync: {
    schedule(connector: string, frequency: string): void;
    manual(connector: string): Promise<SyncResult>;
    bidirectional(connector: string): Promise<SyncResult>;
  };
  webhooks: {
    register(url: string, events: string[]): string;
    verify(signature: string, payload: any): boolean;
    process(event: WebhookEvent): void;
  };
  monitoring: {
    health(connector: string): HealthStatus;
    metrics(connector: string): Metrics;
    logs(connector: string, filter?: Filter): Log[];
  };
}
```

#### Acceptance Criteria

- [ ] All connectors implemented
- [ ] OAuth flows working
- [ ] Data mapping correct
- [ ] Sync mechanisms tested
- [ ] Webhook processing reliable
- [ ] Error handling robust
- [ ] Monitoring dashboard available
- [ ] Rate limiting implemented

## Integration Testing Checkpoints

### Checkpoint 1: Foundation Validation (End of Phase 1)

```typescript
describe('Foundation Integration Tests', () => {
  test('User can complete full onboarding flow');
  test('API key encryption and decryption cycle');
  test('Database transactions maintain integrity');
  test('Compliance engine validates sample reports');
  test('Authentication flow with all providers');
  test('Role-based access control enforcement');
});
```

### Checkpoint 2: Orchestrator Validation (End of Phase 2)

```typescript
describe('Orchestrator Integration Tests', () => {
  test('Complete workflow execution from start to finish');
  test('Agent coordination under load');
  test('Skill chaining with dependencies');
  test('State recovery after failure');
  test('Parallel skill execution');
  test('Workflow rollback mechanism');
});
```

### Checkpoint 3: Feature Validation (End of Phase 3)

```typescript
describe('Feature Integration Tests', () => {
  test('Generate IICRC-compliant report end-to-end');
  test('Create and export estimate to Xactimate');
  test('Develop scope with AI assistance');
  test('Integration sync with external systems');
  test('Complete restoration project lifecycle');
  test('Multi-user collaboration scenario');
});
```

## Performance Benchmarks

### Target Metrics

```yaml
performance_targets:
  response_times:
    api_endpoints: <200ms (p95)
    page_loads: <2s (p95)
    report_generation: <5s (p95)
    estimate_creation: <3s (p95)

  throughput:
    concurrent_users: 1000
    reports_per_hour: 500
    api_requests_per_second: 100

  reliability:
    uptime: 99.9%
    data_durability: 99.999%
    error_rate: <0.1%

  scalability:
    horizontal_scaling: Automatic
    database_connections: Pooled (100 max)
    cache_hit_rate: >80%
```

## Security Validation

### Security Checklist

- [ ] API keys encrypted at rest
- [ ] TLS 1.3 for all connections
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified
- [ ] XSS protection implemented
- [ ] CSRF tokens in use
- [ ] Rate limiting active
- [ ] Audit logging comprehensive
- [ ] Penetration testing completed
- [ ] OWASP Top 10 addressed

## Deployment Strategy

### Progressive Rollout

```yaml
deployment_phases:
  alpha:
    users: Internal team only
    features: Core functionality
    duration: 2 weeks
    focus: Bug identification

  beta:
    users: 50 selected customers
    features: All Phase 1 & 2
    duration: 4 weeks
    focus: Performance validation

  production:
    users: All customers
    features: Complete platform
    rollout: 10% -> 25% -> 50% -> 100%
    monitoring: Enhanced
```

## Success Metrics

### Key Performance Indicators

```yaml
kpis:
  technical:
    - API response time <200ms
    - System uptime >99.9%
    - Error rate <0.1%
    - Test coverage >80%

  business:
    - User onboarding completion >90%
    - Report generation success >95%
    - Customer satisfaction >4.5/5
    - Support ticket reduction 30%

  compliance:
    - IICRC compliance score 100%
    - Audit trail completeness 100%
    - Data encryption coverage 100%
    - Security vulnerability count 0
```

## Risk Mitigation

### Identified Risks & Mitigations

```yaml
risks:
  technical:
    - risk: API rate limiting
      mitigation: Implement caching and queue system

    - risk: Database scaling
      mitigation: Read replicas and sharding strategy

    - risk: AI model changes
      mitigation: Version lock and fallback options

  business:
    - risk: User adoption
      mitigation: Comprehensive training and support

    - risk: Compliance changes
      mitigation: Modular compliance engine

  security:
    - risk: API key exposure
      mitigation: Encryption and access controls

    - risk: Data breach
      mitigation: Defense in depth strategy
```

## Rollback Procedures

### Rollback Plan

```yaml
rollback_strategy:
  triggers:
    - Critical bug affecting >10% users
    - Data corruption detected
    - Security vulnerability discovered
    - Performance degradation >50%

  procedure:
    1. Activate incident response team
    2. Switch to previous stable version
    3. Restore database from backup
    4. Clear caches and queues
    5. Notify affected users
    6. Post-mortem analysis

  recovery_time_objective: <1 hour
  recovery_point_objective: <15 minutes
```