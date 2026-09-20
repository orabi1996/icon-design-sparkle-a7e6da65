# HRMS Backup, Disaster Recovery & Credential Rotation Policy

This document defines the enterprise operational procedures, backup strategies, point-in-time recovery (PITR), retention schedules, and secret rotation protocols for the Human Resources Management System (HRMS).

---

## 1. Database Backup Strategy

| Backup Type | Frequency | Retention Period | RPO Target | RTO Target | Storage Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Continuous WAL (PITR)** | Continuous (streaming) | 30 Days | < 5 minutes | < 30 minutes | Encrypted S3-compatible Object Storage |
| **Full Logical Backup** | Daily (02:00 AST) | 90 Days | 24 Hours | < 45 minutes | Geo-replicated Encrypted Vault |
| **Monthly Snapshot** | 1st of each month | 7 Years | 30 Days | < 2 hours | Long-term Glacier / Cold Storage |

### Automated Backup Command (Daily Logical Dump)
```bash
# Automated via pg_dump with custom compressed format
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom \
  --blobs \
  --no-owner \
  --no-privileges \
  --file="/backups/hrms_db_$(date +%Y%m%d_%H%M%S).dump"
```

---

## 2. Restore Procedure (Step-by-Step)

> [!CAUTION]
> Never restore a backup directly into a production database without first validating it on an isolated staging or recovery instance.

### Phase 1: Pre-Restoration Verification
1. Download target backup file and verify SHA-256 checksum against backup catalog manifest:
   ```bash
   sha256sum -c hrms_db_20260919.dump.sha256
   ```
2. Provision an isolated restore instance (identical Postgres version and extensions).
3. Ensure no active application connections exist to the target database.

### Phase 2: Schema & Data Restoration
1. Create a clean database target:
   ```sql
   DROP DATABASE IF EXISTS hrms_recovery;
   CREATE DATABASE hrms_recovery WITH ENCODING 'UTF8';
   ```
2. Execute restoration with `pg_restore`:
   ```bash
   pg_restore -h "$RESTORE_HOST" -U "$RESTORE_USER" -d hrms_recovery \
     --clean --if-exists \
     --exit-on-error \
     --verbose "/backups/hrms_db_20260919.dump"
   ```

### Phase 3: Post-Restoration Integrity Verification
1. Run automated reconciliation checks:
   - Row count verification across `employees`, `payroll_runs`, `m08_attendance_daily`, `loans`.
   - Financial zero-difference verification: `sum(gross_salary - total_deductions) === sum(net_salary)`.
2. Confirm RLS policies are enabled on all tables:
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
     AND rowsecurity = false; -- MUST RETURN ZERO ROWS
   ```
3. Switch DNS/Connection strings to the recovered database.

---

## 3. Point-in-Time Recovery (PITR) Requirements

PITR enables rolling the database state back to any millisecond within the 30-day WAL retention window.

### Prerequisites:
- Continuous WAL archiving configured via `archive_mode = on` and `archive_command`.
- Supabase Managed PITR enabled or physical base backups synchronized with WAL archive bucket.

### Replay Command (`recovery.signal`):
```ini
restore_command = 'cp /wal_archive/%f %p'
recovery_target_time = '2026-09-18 14:32:00+03'
recovery_target_action = 'promote'
```

---

## 4. Migration Backup Procedure

Before applying any schema migration in production:
1. **Create an Immediate Pre-Migration Point Snapshot**:
   ```bash
   # Create pre-migration dump
   pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
     --format=custom --file="/backups/pre_migration_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Execute Migration Inside an Explicit Transaction**:
   Every migration file MUST wrap changes in `BEGIN; ... COMMIT;`.
3. **Automated Rollback Verification**:
   Ensure a corresponding rollback SQL script (`down.sql`) or atomic revert strategy exists.
4. If a migration fails mid-execution, Postgres rolls back the transaction automatically. If data corruption occurs post-migration, restore the pre-migration snapshot immediately.

---

## 5. File & Storage Backup Strategy

Supabase Storage buckets containing critical files:
- `employee-documents` (National IDs, passports, educational certificates)
- `employee-permits` (Hourly permit attachments)
- `eos-attachments` (End-of-service clearance signed letters)
- `employee-correspondence` (Formal administrative correspondence)

### Synchronization Protocol:
- **Nightly Sync**: Rsync / S3 batch copy from active storage bucket to cold disaster-recovery bucket:
  ```bash
  aws s3 sync s3://hrms-production-storage s3://hrms-dr-storage-replica \
    --delete \
    --storage-class GLACIER_IR
  ```
- **Object Versioning**: Enabled on all buckets to prevent accidental deletion or ransomware overwrites.

---

## 6. Secret Rotation Procedure

### Zero-Downtime Secret Rotation Lifecycle
```
[Old Secret Active] 
       ↓ (Deploy config with Old + New valid)
[Dual-Secret Grace Period: 48 Hours] 
       ↓ (Verify all services accept New Secret)
[Deprecate Old Secret]
```

---

## 7. SMTP Credential Rotation
1. Update SMTP credentials in the database via `updateEmailConfigFn`:
   - Enters new host, port, username, password.
   - Credentials are automatically encrypted using `EMAIL_CONFIG_ENCRYPTION_KEY`.
2. Run diagnostic handshake via `testSmtpConnectionFn` before saving.
3. Once verified, save the new configuration. Active email outbox workers pick up the new encrypted configuration on the next poll cycle.

---

## 8. Service-Role Key Rotation
1. Generate new `SUPABASE_SERVICE_ROLE_KEY` in Supabase Project Settings.
2. Update environment variable in staging server first, restart services, and run automated health checks.
3. Update environment variable in production server deployment config.
4. Verify all server functions execute without authentication errors.
5. Invalidate the old service-role key in Supabase console.

---

## 9. Encryption Key Rotation Strategy (`EMAIL_CONFIG_ENCRYPTION_KEY`)

When rotating the data encryption key:
1. Support Key Versioning prefix in ciphertext:
   - Format: `v1:<iv>:<ciphertext>` vs `v2:<iv>:<ciphertext>`.
2. Configure application with `PRIMARY_ENCRYPTION_KEY` (v2) and `FALLBACK_ENCRYPTION_KEYS` (v1).
3. Execute batch re-encryption script:
   - Reads all encrypted SMTP configs and tokens using v1 key.
   - Re-encrypts with v2 key and updates the database.
4. Remove v1 key once all database records have been re-encrypted to v2.

---

## 10. Audit & Log Retention Policy

In accordance with Saudi Labor and Financial regulations:

| Log Type | Storage Location | Hot Retention | Cold Retention | Total Retention |
| :--- | :--- | :--- | :--- | :--- |
| **Payroll & Financial Audit** | `security_audit_logs` | 1 Year | 9 Years | **10 Years** |
| **User Access & Auth Logs** | `security_audit_logs` | 90 Days | 275 Days | **1 Year** |
| **System Application Logs** | CloudWatch / Vector | 30 Days | 60 Days | **90 Days** |
| **Email Outbox Delivery Logs**| `wf_outbox_events` | 90 Days | 275 Days | **1 Year** |

---

## 11. Tested Backup Restore Checklist

- [ ] **1. Integrity Verification**: Downloaded backup file SHA-256 matches catalog manifest.
- [ ] **2. Isolated Target**: Staging recovery database created with UTF-8 encoding.
- [ ] **3. Restore Command**: Executed `pg_restore --clean --if-exists --exit-on-error`.
- [ ] **4. Extension Check**: Confirmed `uuid-ossp`, `pgcrypto`, and `pg_stat_statements` are active.
- [ ] **5. RLS Audit**: Confirmed `rowsecurity = true` on 100% of public tables. Zero tables unprotected.
- [ ] **6. Table Count**: Confirmed all 41 core tables exist.
- [ ] **7. Row Count Consistency**: Target row counts match pre-backup manifest within 0.01%.
- [ ] **8. Financial Zero-Discrepancy**: Sum of Net Salaries in payslips equals Payroll Run totals.
- [ ] **9. Trigger Verification**: Confirmed immutability triggers on locked payroll, audit logs, and loans are intact.
- [ ] **10. Application Smoke Test**: Connected staging test client, executed login, read staff directory, and approved dummy workflow.
- [ ] **11. Sign-off**: Signed by Operations Lead and Lead Database Administrator.
