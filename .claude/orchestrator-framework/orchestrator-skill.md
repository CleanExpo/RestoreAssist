---
title: RestoreAssist Skills Orchestrator Master Definition
version: 1.0.0
type: master-skill
iicrc_compliance: S500, S520
last_updated: 2025-11-05
---

# RestoreAssist Skills Orchestrator Framework

## Executive Summary

The RestoreAssist Skills Orchestrator is an AI-powered system that coordinates specialized restoration reporting capabilities through a hierarchical skill structure. This framework ensures IICRC compliance while maintaining flexibility for various restoration scenarios.

## Core Architecture

### Orchestrator Hierarchy

```yaml
orchestrator:
  name: RestoreAssist Master Orchestrator
  version: 1.0.0
  compliance_standards:
    - IICRC S500 (Water Damage Restoration)
    - IICRC S520 (Mold Remediation)
    - EPA RRP (Lead Safety)
    - OSHA 29 CFR 1910.1030 (Bloodborne Pathogens)

  layers:
    L1_Foundation:
      - Authentication & Authorization
      - API Key Management (BYOK)
      - Database Operations
      - Compliance Engine

    L2_Core:
      - Workflow Management
      - Agent Coordination
      - Skill Registry
      - State Management

    L3_Specialized:
      - Damage Assessment
      - Report Generation
      - Estimate Creation
      - Scope Development

    L4_Integration:
      - External APIs
      - Document Export
      - Client Communication
      - Insurance Processing
```

## Skill Categories

### 1. Assessment Skills

```yaml
assessment_skills:
  water_damage_assessor:
    capabilities:
      - Category determination (1, 2, 3)
      - Class identification (1, 2, 3, 4)
      - Moisture mapping
      - Psychrometric analysis
    dependencies:
      - iicrc_compliance_validator
      - measurement_calculator
    compliance: IICRC S500

  mold_assessor:
    capabilities:
      - Visual inspection documentation
      - Containment requirements
      - Remediation scope
      - Post-remediation verification
    dependencies:
      - iicrc_compliance_validator
      - safety_protocol_manager
    compliance: IICRC S520

  structural_assessor:
    capabilities:
      - Load-bearing impact
      - Material degradation
      - Reconstruction needs
      - Safety hazards
    dependencies:
      - engineering_standards
      - building_codes
```

### 2. Documentation Skills

```yaml
documentation_skills:
  report_generator:
    capabilities:
      - Executive summary creation
      - Technical documentation
      - Photo integration
      - Timeline construction
    dependencies:
      - template_engine
      - compliance_formatter
      - data_aggregator
    outputs:
      - PDF reports
      - Insurance forms
      - Work authorizations

  estimate_builder:
    capabilities:
      - Line-item generation
      - Xactimate integration
      - Cost library management
      - Markup calculations
    dependencies:
      - pricing_database
      - regional_adjustments
      - insurance_guidelines

  scope_writer:
    capabilities:
      - Room-by-room documentation
      - Material specifications
      - Labor requirements
      - Equipment needs
    dependencies:
      - measurement_calculator
      - material_database
      - labor_standards
```

### 3. Compliance Skills

```yaml
compliance_skills:
  iicrc_validator:
    standards:
      S500:
        - Water categorization
        - Class determination
        - Drying documentation
        - Safety protocols
      S520:
        - Containment specifications
        - Clearance criteria
        - Worker protection
        - Waste disposal
    validation_rules:
      - Mandatory fields check
      - Standard compliance verification
      - Documentation completeness
      - Certification requirements

  insurance_compliance:
    capabilities:
      - Coverage verification
      - Documentation requirements
      - Claim formatting
      - Supplemental justification
    carriers:
      - State Farm
      - Allstate
      - Progressive
      - USAA
      - Generic formats
```

### 4. Calculation Skills

```yaml
calculation_skills:
  psychrometric_calculator:
    inputs:
      - Temperature
      - Relative humidity
      - Atmospheric pressure
    outputs:
      - Dew point
      - Grains per pound
      - Vapor pressure
      - Specific humidity
    formulas:
      - ASHRAE standards
      - IICRC drying goals

  equipment_calculator:
    capabilities:
      - Dehumidifier sizing
      - Air mover placement
      - HEPA requirements
      - Containment sizing
    factors:
      - Room volume
      - Material porosity
      - Water category
      - Ambient conditions

  cost_calculator:
    components:
      - Materials cost
      - Labor hours
      - Equipment rental
      - Overhead/profit
      - Tax calculations
    modifiers:
      - Regional factors
      - Emergency rates
      - Complexity factors
      - Market conditions
```

## Skill Dependencies Matrix

```yaml
dependency_matrix:
  report_generation:
    requires:
      - water_damage_assessor
      - structural_assessor
      - iicrc_validator
      - psychrometric_calculator
      - photo_processor
    optional:
      - mold_assessor
      - equipment_calculator
      - cost_calculator

  estimate_creation:
    requires:
      - scope_writer
      - cost_calculator
      - material_database
      - labor_standards
    optional:
      - xactimate_integration
      - insurance_compliance

  compliance_check:
    requires:
      - iicrc_validator
      - documentation_skills
      - safety_protocol_manager
    triggers:
      - Non-compliance alerts
      - Missing documentation
      - Safety violations
```

## Integration Points

### 1. External Systems

```yaml
external_integrations:
  anthropic_api:
    purpose: AI-powered analysis and generation
    skills_using:
      - report_generator
      - scope_writer
      - damage_assessor
    configuration:
      - BYOK support
      - Rate limiting
      - Token management

  xactimate:
    purpose: Industry-standard estimating
    skills_using:
      - estimate_builder
      - cost_calculator
    data_exchange:
      - ESX file import/export
      - Price list updates

  docusign:
    purpose: Digital signatures
    skills_using:
      - report_generator
      - work_authorization
    workflow:
      - Template creation
      - Envelope sending
      - Status tracking
```

### 2. Internal Systems

```yaml
internal_integrations:
  database:
    orm: Prisma
    models:
      - User (API keys, preferences)
      - Report (all assessment data)
      - Client (contact information)
      - Scope (detailed work items)
      - Estimate (pricing data)

  storage:
    types:
      - Report PDFs
      - Photos/videos
      - Moisture readings
      - Equipment logs
    providers:
      - AWS S3
      - Local filesystem

  authentication:
    provider: NextAuth
    methods:
      - Email/password
      - OAuth providers
    rbac:
      - User roles
      - Permission sets
```

## Workflow Orchestration

### Phase 1: Initiation
```yaml
initiation_phase:
  trigger: User creates new report
  skills_activated:
    - authentication_validator
    - client_selector
    - project_initializer
  data_collected:
    - Loss address
    - Date of loss
    - Type of damage
    - Insurance information
  validation:
    - Required fields present
    - Client exists or created
    - User has credits/subscription
```

### Phase 2: Assessment
```yaml
assessment_phase:
  skills_sequence:
    1. damage_categorizer:
        - Determine water category
        - Identify affected materials
        - Calculate affected area
    2. safety_assessor:
        - Identify hazards
        - PPE requirements
        - Containment needs
    3. scope_developer:
        - Room-by-room assessment
        - Material quantities
        - Equipment requirements
  ai_integration:
    - Natural language processing
    - Pattern recognition
    - Historical data analysis
```

### Phase 3: Documentation
```yaml
documentation_phase:
  parallel_skills:
    - report_writer
    - estimate_builder
    - photo_annotator
  sequential_skills:
    - compliance_validator
    - quality_checker
    - format_optimizer
  outputs:
    - PDF report
    - Estimate spreadsheet
    - Work authorization
    - Insurance forms
```

### Phase 4: Delivery
```yaml
delivery_phase:
  skills_used:
    - document_packager
    - email_sender
    - signature_collector
    - archive_manager
  channels:
    - Email delivery
    - Client portal
    - Insurance upload
    - Internal archive
```

## Compliance Requirements

### IICRC S500 Water Damage
```yaml
s500_requirements:
  mandatory_documentation:
    - Pre-existing conditions
    - Category determination
    - Class determination
    - Contamination assessment
    - Safety plan
    - Drying plan
    - Daily monitoring logs
    - Completion certificate

  technical_requirements:
    - Moisture content documentation
    - Psychrometric calculations
    - Equipment placement diagrams
    - Air movement patterns
    - Dehumidification calculations
```

### IICRC S520 Mold Remediation
```yaml
s520_requirements:
  mandatory_documentation:
    - Initial assessment
    - Containment plan
    - Worker protection plan
    - Remediation protocol
    - Post-remediation verification
    - Clearance documentation

  technical_requirements:
    - Containment specifications
    - Negative air calculations
    - HEPA filtration requirements
    - Disposal procedures
    - Clearance criteria
```

## Error Handling & Recovery

```yaml
error_handling:
  skill_failures:
    retry_policy:
      - Max attempts: 3
      - Backoff strategy: Exponential
      - Fallback: Manual intervention

  data_validation_errors:
    - Log detailed error
    - Highlight missing fields
    - Suggest corrections
    - Prevent progression

  compliance_violations:
    - Block report generation
    - Alert user
    - Provide remediation steps
    - Log for audit

  api_failures:
    anthropic:
      - Fallback to cached responses
      - Queue for retry
      - Alert user of degraded service
    external:
      - Use local alternatives
      - Manual data entry option
      - Scheduled retry
```

## Performance Metrics

```yaml
performance_metrics:
  skill_execution:
    - Average execution time
    - Success rate
    - Error frequency
    - Resource usage

  quality_metrics:
    - Compliance score
    - Completeness score
    - Accuracy validation
    - User satisfaction

  business_metrics:
    - Reports generated
    - Time to completion
    - Credits consumed
    - Revenue impact
```

## Security & Privacy

```yaml
security_requirements:
  data_protection:
    - Encryption at rest (AES-256)
    - Encryption in transit (TLS 1.3)
    - PII handling compliance
    - HIPAA considerations

  api_security:
    - Key rotation policy
    - Rate limiting
    - IP whitelisting
    - Audit logging

  access_control:
    - Role-based permissions
    - Resource-level security
    - Multi-tenant isolation
    - Session management
```

## Skill Evolution Path

```yaml
evolution_roadmap:
  current_version: 1.0.0

  planned_enhancements:
    v1.1:
      - Enhanced AI analysis
      - Additional compliance standards
      - Mobile app integration

    v1.2:
      - Real-time collaboration
      - Advanced analytics
      - Predictive modeling

    v2.0:
      - Full automation capabilities
      - Multi-language support
      - Global compliance standards
      - IoT sensor integration
```

## Testing Requirements

```yaml
testing_matrix:
  unit_tests:
    - Individual skill validation
    - Calculation accuracy
    - Data transformation

  integration_tests:
    - Skill chain execution
    - API interactions
    - Database operations

  compliance_tests:
    - IICRC standard validation
    - Report completeness
    - Required field presence

  performance_tests:
    - Load testing
    - Concurrent user simulation
    - API rate limit validation
```

## Deployment Configuration

```yaml
deployment:
  environments:
    development:
      - Feature flags enabled
      - Verbose logging
      - Mock external APIs

    staging:
      - Production-like data
      - Integration testing
      - Performance monitoring

    production:
      - High availability
      - Auto-scaling
      - Disaster recovery
      - Real-time monitoring
```