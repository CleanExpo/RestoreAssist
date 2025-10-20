# Guardrails Policy

Safety rules for write operations, protected files, and progression gates.

## Write Scope Rules

### Allowed Write Paths
Files within these patterns can be modified by agents:

```
src/**
app/**
docs/**
.github/**
tests/**
scripts/**
public/**
styles/**
components/**
lib/**
utils/**
```

### Protected Paths (Read-Only)
These paths require explicit user approval to modify:

```
.env*                 # Environment variables
.git/**              # Git internals
infra/**             # Infrastructure code
Dockerfile           # Container config
docker-compose.yml   # Container orchestration
compose.yml          # Container orchestration
*.pem                # Certificates
*.key                # Private keys
package-lock.json    # Lock file (npm install only)
yarn.lock            # Lock file (yarn install only)
pnpm-lock.yaml       # Lock file (pnpm install only)
```

### Forbidden Operations
These operations are never allowed without explicit user command:

```
❌ Delete .git directory
❌ Modify production database directly
❌ Push to remote git repository
❌ Delete node_modules (user runs install/clean)
❌ Modify lock files directly
❌ Change .gitignore without review
```

## Dry Run Logic

### When to Use Dry Run

Automatically enable dry-run mode for:
- First time running a deployment
- Bulk data operations (>100 records)
- Database migrations in production
- Infrastructure changes
- Large refactors (>10 files)

### Dry Run Process

```typescript
// Example: Dry run for data import
async function importData(data: any[], dryRun = true) {
  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
    
    // Validate data
    const valid = validate(data);
    console.log(`Validation: ${valid.length} records valid`);
    
    // Show what would happen
    console.log(`Would create: ${valid.filter(r => !r.exists).length}`);
    console.log(`Would update: ${valid.filter(r => r.exists).length}`);
    
    return { dryRun: true, summary };
  }
  
  // Actual operation
  return await performImport(data);
}
```

## File Operation Safety

### Before Writing Files

1. **Check write scope**
   ```typescript
   function canWrite(path: string): boolean {
     const allowed = ['src/**', 'app/**', 'docs/**'];
     const protected = ['.env*', 'infra/**'];
     
     if (micromatch.isMatch(path, protected)) {
       return false; // Requires approval
     }
     
     return micromatch.isMatch(path, allowed);
   }
   ```

2. **Backup if replacing**
   ```typescript
   if (fs.existsSync(path)) {
     const backup = `${path}.backup`;
     fs.copyFileSync(path, backup);
   }
   ```

3. **Validate content**
   ```typescript
   // Check for common issues
   if (content.includes('TODO') && !allowTODO) {
     warn('File contains TODO comments');
   }
   
   if (content.includes('hardcoded-secret-pattern')) {
     throw new Error('Potential secret detected');
   }
   ```

## Test Gates

### Require Tests to Pass

When `guardrails.require_tests_to_pass: true`:

```typescript
async function proceedWithDeployment() {
  // Run tests
  const testResult = await runTests();
  
  if (!testResult.success) {
    throw new Error(
      `Cannot proceed: ${testResult.failed} tests failing`
    );
  }
  
  // Proceed with deployment
  await deploy();
}
```

### Test Categories

- **Unit Tests**: Must pass before commit
- **Integration Tests**: Must pass before PR merge
- **E2E Tests**: Must pass before deployment

## Command Execution Safety

### Requires Approval

Commands that require user approval:

```bash
# Installation/removal
npm install <package>
npm uninstall <package>
yarn add <package>
pnpm add <package>

# Database operations
npm run migrate
npm run db:push
npm run db:seed

# Build operations
npm run build
npm run build:prod

# Deployment
npm run deploy
vercel --prod
```

### Auto-Approved

Safe commands that don't require approval:

```bash
# Development
npm run dev
npm run start
npm test
npm run lint

# Information
npm list
git status
git log
cat <file>
```

## Environment Safety

### Development Environment
```yaml
environment: development
guardrails:
  strict_mode: false
  require_tests: false
  allow_destructive_ops: true
  auto_approve: ['install', 'dev', 'test']
```

### Staging Environment
```yaml
environment: staging
guardrails:
  strict_mode: true
  require_tests: true
  allow_destructive_ops: false
  auto_approve: ['dev', 'test']
```

### Production Environment
```yaml
environment: production
guardrails:
  strict_mode: true
  require_tests: true
  require_approval: true
  allow_destructive_ops: false
  auto_approve: []  # Nothing auto-approved
```

## Progression Gates

### Feature Workflow Gates

```
1. Research → No gate (safe, read-only)
2. Coder → Gate: Code review
3. Tester → Gate: Tests must pass
4. Integrator → Gate: Build must succeed
5. Master-Fullstack → Gate: Completeness review
6. Master-DevOps → Gate: Manual approval
```

### Required Checks

Before marking feature complete:

```
- [ ] All code written
- [ ] All tests passing
- [ ] No TODOs or FIXMEs (or documented)
- [ ] Documentation updated
- [ ] No console errors
- [ ] Build succeeds
- [ ] Linter passes
```

## Validation Rules

### Code Quality

```typescript
interface QualityGates {
  maxFileSize: 500;        // lines
  maxFunctionSize: 50;     // lines
  maxComplexity: 10;       // cyclomatic complexity
  minCoverage: 80;         // percentage
  noConsoleLog: true;      // in production code
  noDebugger: true;        // must remove
}
```

### Security Checks

```typescript
const securityRules = {
  noHardcodedSecrets: true,
  noEval: true,
  noDangerousHTML: true,
  requireInputValidation: true,
  requireOutputEscaping: true,
  requireCSRFProtection: true
};
```

## Escalation Protocol

### When to Escalate to User

Escalate when:
- Protected file modification needed
- Destructive operation required
- Test failures block progression
- Security concern detected
- Unclear requirements
- Multiple valid approaches exist

### Escalation Format

```markdown
## ⚠️ Approval Required

**Operation**: Modify protected file
**File**: .env.production
**Reason**: Add new API key for feature

**Risk Level**: Medium
- Could expose secrets if committed
- Requires secure handling

**Alternatives Considered**:
1. Use existing key (insufficient permissions)
2. Create new service account (requires infra)

**Recommendation**: 
Add key to .env.production with proper permissions

**Proceed?** (yes/no)
```

## Audit Trail

### Log All Operations

```typescript
const auditLog = {
  timestamp: new Date(),
  agent: 'coder',
  operation: 'write_file',
  path: 'src/components/Button.tsx',
  approved: true,
  approvedBy: 'user',
  success: true
};
```

### Review Logs

```bash
# View recent operations
tail -100 .claude/logs/audit.log

# Search for protected file access
grep "protected_file" .claude/logs/audit.log

# Find failed operations
grep "success:false" .claude/logs/audit.log
```

---

**Remember**: Guardrails exist to prevent accidents, not block progress. When stuck, escalate to the user.
