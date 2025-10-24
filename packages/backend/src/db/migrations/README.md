# Database Migrations

This directory contains SQL migration scripts for the RestoreAssist database schema.

## Migration Files

### Core Tables (001-004)
- `001_create_customers_table.sql` - Customer management
- `002_create_stripe_sessions_table.sql` - Stripe payment sessions
- `003_create_restores_table.sql` - Backup restore tracking
- `004_create_invoices_table.sql` - Invoice management

### Authentication & Security (005-006)
- `005_create_users_table.sql` - User authentication with email/password
  - Users table with role-based access
  - Email verification support
  - Password reset tokens
  - Automatic updated_at triggers

- `006_create_auth_tables.sql` - Rate limiting and device tracking
  - `auth_attempts` - Track login attempts for rate limiting
  - `device_fingerprints` - Device identification for fraud prevention
  - Helper functions for rate limit checking

### Trial & Subscription Management (007-008)
- `007_create_trial_tables.sql` - Free trial and fraud detection
  - `free_trial_tokens` - Manage trial access tokens
  - `trial_fraud_flags` - Track suspicious activity
  - `subscription_history` - Track trial to paid conversions
  - Duplicate trial detection functions
  - Fraud risk scoring

- `008_add_foreign_keys_and_constraints.sql` - Data integrity
  - Cross-table foreign keys
  - Business logic constraints
  - Materialized view for user trial status
  - Automatic fraud detection triggers

### Utilities
- `009_rollback_scripts.sql` - Safe rollback procedures
  - Individual migration rollbacks
  - Complete rollback script
  - Emergency rollback option
  - Verification queries

## Running Migrations

### Apply All Migrations
```bash
# From the backend directory
npm run db:migrate
```

### Apply Individual Migration
```bash
# Connect to your database and run
\i packages/backend/src/db/migrations/005_create_users_table.sql
```

### Check Migration Status
```sql
-- Check which tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

## Rollback Procedures

### Complete Rollback
To rollback all migrations (005-008):
```sql
\i packages/backend/src/db/migrations/009_rollback_scripts.sql
```

### Partial Rollback
To rollback a specific migration, use the commented rollback section at the bottom of each migration file:
```sql
-- Example: Rollback migration 007
-- DROP FUNCTION IF EXISTS expire_unused_tokens();
-- DROP FUNCTION IF EXISTS calculate_fraud_risk_score(UUID, VARCHAR, INET);
-- DROP FUNCTION IF EXISTS check_duplicate_trial(VARCHAR, INET, VARCHAR);
-- DROP TABLE IF EXISTS subscription_history CASCADE;
-- DROP TABLE IF EXISTS trial_fraud_flags CASCADE;
-- DROP TABLE IF EXISTS free_trial_tokens CASCADE;
```

## Database Schema Overview

### Authentication Flow
```
users → auth_attempts (rate limiting)
     → device_fingerprints (fraud detection)
```

### Trial Management Flow
```
users → free_trial_tokens → subscription_history
     → trial_fraud_flags (monitoring)
```

### Key Features

1. **Rate Limiting**: Automatic tracking of failed login attempts
2. **Device Fingerprinting**: Identify and track devices for security
3. **Trial Fraud Prevention**:
   - Duplicate trial detection (email, IP, device)
   - Risk scoring algorithm
   - Automatic flagging of suspicious activity
4. **Data Integrity**:
   - Foreign key constraints
   - Check constraints for business rules
   - Triggers for automatic updates

## Security Considerations

1. **Password Storage**: Uses bcrypt hashing (handled by application)
2. **Rate Limiting**: Built-in functions to check attempt limits
3. **IP Tracking**: Stores IP addresses for security monitoring
4. **Fraud Detection**: Multiple layers of duplicate and fraud checks
5. **Data Retention**: Automatic cleanup functions for old data

## Maintenance Tasks

### Regular Cleanup
```sql
-- Clean old auth attempts (> 90 days)
SELECT clean_old_auth_attempts();

-- Expire unused tokens
SELECT expire_unused_tokens();

-- Full cleanup
SELECT * FROM cleanup_expired_data();
```

### Refresh Materialized Views
```sql
-- Update user trial status view
SELECT refresh_user_trial_status();
```

### Check Fraud Indicators
```sql
-- View high-risk users
SELECT * FROM trial_fraud_flags
WHERE severity IN ('high', 'critical')
  AND resolved = false
ORDER BY created_at DESC;

-- Check user risk scores
SELECT user_id, email, max_fraud_risk_score
FROM user_trial_status
WHERE max_fraud_risk_score > 50
ORDER BY max_fraud_risk_score DESC;
```

## Development Guidelines

1. **Naming Convention**:
   - Tables: plural, snake_case (e.g., `users`, `auth_attempts`)
   - Indexes: `idx_tablename_column` format
   - Functions: snake_case, descriptive names

2. **Migration Numbering**:
   - Sequential numbering (001, 002, etc.)
   - Never reuse numbers
   - Group related changes

3. **Rollback Support**:
   - Always include rollback commands
   - Test rollback before production deployment
   - Document dependencies

4. **Testing**:
   - Test migrations on development database first
   - Verify rollback procedures
   - Check performance impact of indexes

## Troubleshooting

### Common Issues

1. **Migration Fails**: Check for existing objects
```sql
-- Check if table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'users'
);
```

2. **Foreign Key Violations**: Ensure referenced tables exist
```sql
-- Check foreign key constraints
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f';
```

3. **Performance Issues**: Analyze and vacuum after migrations
```sql
ANALYZE;
VACUUM ANALYZE;
```

## Contact

For database-related issues or questions about migrations, please refer to the development team documentation or create an issue in the project repository.