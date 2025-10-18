# Database Setup Guide

RestoreAssist supports **two database modes**:

1. **In-Memory** (default) - Fast, no setup, data lost on restart
2. **PostgreSQL** - Persistent storage, production-ready

---

## Quick Start: In-Memory Mode (Default)

No setup required! Just run:

```bash
npm run dev
```

Data is stored in RAM and will be lost when the server restarts.

---

## PostgreSQL Setup

### Prerequisites

- PostgreSQL 14+ installed
- Access to create databases

### 1. Install PostgreSQL

**Windows**:
```bash
# Download from https://www.postgresql.org/download/windows/
# Or use Chocolatey:
choco install postgresql
```

**macOS**:
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE restoreassist;

# Create user (optional, but recommended)
CREATE USER restoreassist_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE restoreassist TO restoreassist_user;

# Exit
\q
```

### 3. Run Migrations

```bash
# Navigate to migrations directory
cd src/db/migrations

# Run migrations in order
psql -U postgres -d restoreassist -f 001_create_reports.sql
psql -U postgres -d restoreassist -f 002_add_indexes.sql
```

### 4. Update Environment Variables

Edit `.env.local`:

```bash
# Enable PostgreSQL
USE_POSTGRES=true

# PostgreSQL connection details
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restoreassist
DB_USER=postgres  # or restoreassist_user
DB_PASSWORD=postgres  # or your_secure_password
DB_POOL_SIZE=20
```

### 5. Start Server

```bash
npm run dev
```

You should see:
```
✅ Database connection successful
✅ Database initialized successfully
🚀 RestoreAssist Backend running on http://localhost:3001
```

---

## Database Schema

### `reports` Table

| Column | Type | Description |
|--------|------|-------------|
| report_id | UUID | Primary key |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |
| property_address | TEXT | Property address |
| damage_type | VARCHAR(50) | water, fire, storm, flood, mold |
| damage_description | TEXT | Damage description |
| state | VARCHAR(10) | Australian state (NSW, VIC, etc.) |
| summary | TEXT | AI-generated summary |
| scope_of_work | JSONB | Work items array |
| itemized_estimate | JSONB | Cost items array |
| total_cost | DECIMAL(12,2) | Total cost in AUD |
| compliance_notes | JSONB | Compliance notes array |
| authority_to_proceed | TEXT | ATP document |
| client_name | VARCHAR(255) | Client name (optional) |
| insurance_company | VARCHAR(255) | Insurance company (optional) |
| claim_number | VARCHAR(100) | Claim number (optional) |
| generated_by | VARCHAR(100) | Generator name |
| model | VARCHAR(100) | AI model used |
| deleted_at | TIMESTAMP | Soft delete timestamp |

### Indexes

- `idx_reports_created_at` - Fast sorting by date
- `idx_reports_state` - Filter by state
- `idx_reports_damage_type` - Filter by damage type
- `idx_reports_total_cost` - Sort by cost
- `idx_reports_fulltext_search` - Full-text search
- `idx_reports_pagination` - Efficient pagination

---

## Migration Commands

### Run Migrations

```bash
psql -U postgres -d restoreassist -f src/db/migrations/001_create_reports.sql
psql -U postgres -d restoreassist -f src/db/migrations/002_add_indexes.sql
```

### Rollback (Delete All Data!)

```bash
psql -U postgres -d restoreassist -f src/db/migrations/000_rollback.sql
```

---

## Connection Pool

The application uses `pg-promise` with connection pooling:

- **Max connections**: 20 (configurable via `DB_POOL_SIZE`)
- **Idle timeout**: 30 seconds
- **Connection timeout**: 2 seconds

Monitor pool usage in admin stats:
```bash
curl http://localhost:3001/api/admin/health
```

---

## Testing Connection

### From Code

The server automatically tests the connection on startup.

### Manual Test

```bash
psql -U postgres -d restoreassist -c "SELECT COUNT(*) FROM reports;"
```

### Health Check

```bash
curl http://localhost:3001/api/admin/health
```

---

## Switching Between Modes

### Switch to PostgreSQL

1. Set `USE_POSTGRES=true` in `.env.local`
2. Restart server
3. Data will be persisted in PostgreSQL

### Switch to In-Memory

1. Set `USE_POSTGRES=false` in `.env.local`
2. Restart server
3. Data will be stored in RAM

**Note**: Data is **not** automatically migrated between modes!

---

## Troubleshooting

### Connection Failed

**Error**: `Database connection failed`

**Solutions**:
1. Check PostgreSQL is running:
   ```bash
   # Windows
   Get-Service postgresql*

   # Mac/Linux
   brew services list  # macOS
   sudo systemctl status postgresql  # Linux
   ```

2. Verify credentials in `.env.local`
3. Check database exists:
   ```bash
   psql -U postgres -c "\l"
   ```

### Table Does Not Exist

**Error**: `Reports table does not exist`

**Solution**: Run migrations:
```bash
psql -U postgres -d restoreassist -f src/db/migrations/001_create_reports.sql
```

### Permission Denied

**Error**: `EPERM: operation not permitted`

**Solution**: Grant permissions:
```bash
GRANT ALL PRIVILEGES ON DATABASE restoreassist TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
```

---

## Backup & Restore

### Backup

```bash
pg_dump -U postgres restoreassist > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql -U postgres -d restoreassist < backup_20241018.sql
```

---

## Production Deployment

### Recommended Settings

```bash
# Production environment
USE_POSTGRES=true
NODE_ENV=production

# Use managed database service
DB_HOST=your-postgres-host.aws.com
DB_PORT=5432
DB_NAME=restoreassist
DB_USER=restoreassist_prod
DB_PASSWORD=your_strong_password_here
DB_POOL_SIZE=50

# Enable SSL
DB_SSL=true
```

### Managed Database Services

- **AWS RDS** (PostgreSQL)
- **Azure Database** for PostgreSQL
- **Google Cloud SQL**
- **Heroku Postgres**
- **DigitalOcean Managed Databases**

---

## Performance Tips

1. **Use indexes** - Already optimized for common queries
2. **Pagination** - Always use `page` and `limit` parameters
3. **Connection pooling** - Increase `DB_POOL_SIZE` for high traffic
4. **Monitoring** - Use `/api/admin/health` to monitor database performance
5. **Cleanup** - Regularly delete old reports with `/api/reports/cleanup/old`

---

## Support

For issues or questions:
- Check logs: Look for database-related errors in console
- Test connection: Use `curl http://localhost:3001/api/admin/health`
- Review migrations: Ensure all migration files ran successfully
