# Database Tier (PostgreSQL)

This folder contains the complete PostgreSQL database architecture for the Patient Statement Portal:

## Directory Structure
- `migrations/`: Version-controlled SQL migration scripts (001_core.sql through 012_*.sql).
- `pool.js`: Production-ready PostgreSQL connection pool with automated SSL, Supabase, and transaction support.
- `migrate.js`: Migration runner script.

## Running Migrations
```bash
# From repository root
npm run db:migrate

# Or directly in database/
node migrate.js
```
