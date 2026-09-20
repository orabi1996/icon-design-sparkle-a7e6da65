# HRMS Operational Incident Runbook

This runbook provides actionable, step-by-step diagnostic and remediation protocols for 8 critical operational failure modes.

---

## Severity Classification

| Severity Level | Response SLA | Notification Channel | Criteria |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | < 15 minutes | PagerDuty / SMS / Voice | System down, DB unavailable, payroll calculation error, security breach |
| **ERROR** | < 30 minutes | Slack / Email High Priority | Feature failure, email delivery stalled, permission failures, migration error |
| **WARNING** | < 2 hours | Slack Channel | High query latency (> 500ms), worker backlog growing, transient retries |
| **INFO** | N/A | Log Dashboard | Normal lifecycle operations, scheduled backups, user logins |

---

## Incident 1: Application Down (HTTP 502 / 503 / Process Exit)

### Symptoms:
- Health check probe `/api/health` returns 503 or times out.
- Users see "Bad Gateway" or connection refused.

### Remediation Steps:
1. **Check Process Status**:
   ```bash
   pm2 status || systemctl status hrms-app
   ```
2. **Inspect Process Crash Logs**:
   ```bash
   pm2 logs hrms-app --lines 100 --err
   ```
   *Look for: Uncaught exception, out-of-memory (OOM) killer, or missing environment variables.*
3. **Check System Resources**:
   ```bash
   free -m
   df -h
   ```
4. **Restart Application Gracefully**:
   ```bash
   pm2 reload hrms-app --update-env
   ```
5. **Verify Health Endpoint**:
   ```bash
   curl -i http://localhost:3000/api/health
   ```

---

## Incident 2: Database Unavailable (Connection Pool Exhaustion / Timeout)

### Symptoms:
- Database query times exceed 5000ms or fail with `remaining connection slots are reserved` or `timeout acquiring connection`.

### Remediation Steps:
1. **Inspect Active Database Connections**:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
2. **Identify Long-Running or Blocking Queries**:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '10 seconds'
     AND state != 'idle';
   ```
3. **Terminate Rogue / Stuck Queries**:
   ```sql
   SELECT pg_cancel_backend(pid); -- Try gentle cancel first
   SELECT pg_terminate_backend(pid); -- Force terminate if unresponsive
   ```
4. **Tune Supavisor / Pooler Settings**:
   - Ensure transaction pooling mode is active on port 6543.
   - Adjust `max_connections` or pool size if traffic spikes require scaling.

---

## Incident 3: Email Unavailable (SMTP Outbox Stalled)

### Symptoms:
- `wf_outbox_events` has pending records older than 15 minutes.
- Users do not receive workflow approval notifications or payslips.

### Remediation Steps:
1. **Check Outbox Queue Backlog**:
   ```sql
   SELECT count(*), status FROM public.wf_outbox_events 
   WHERE created_at > now() - interval '24 hours' 
   GROUP BY status;
   ```
2. **Inspect Recent Delivery Errors**:
   ```sql
   SELECT id, recipient_email, retry_count, last_error, scheduled_at
   FROM public.wf_outbox_events
   WHERE status IN ('failed', 'dead_letter')
   ORDER BY updated_at DESC LIMIT 10;
   ```
3. **Run Diagnostic Handshake**:
   - Execute `testSmtpConnectionFn` via server console or admin settings.
   - *If authentication fails*: Verify credentials in `docs/operational/BACKUP_AND_DISASTER_RECOVERY.md#7-smtp-credential-rotation`.
   - *If connection times out*: Check outbound firewall port 465/587.
4. **Reprocess Stalled Outbox Events**:
   ```sql
   UPDATE public.wf_outbox_events 
   SET status = 'pending', retry_count = 0, scheduled_at = now()
   WHERE status = 'dead_letter' AND created_at > now() - interval '2 hours';
   ```

---

## Incident 4: Failed Database Migration

### Symptoms:
- Deployment pipeline errors out during `supabase db push` or migration step.
- Partial table or column changes suspected.

### Remediation Steps:
1. **Verify Transaction State**:
   - All HRMS migrations use explicit `BEGIN; ... COMMIT;`. If an error occurred, Postgres rolled back all DDL statements within that migration.
2. **Check Migration History**:
   ```sql
   SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
   ```
3. **Inspect the Migration Failure Error**:
   - Identify the exact SQL statement and constraint failure (e.g. `duplicate key value violates unique constraint`).
4. **Fix Forward vs Rollback**:
   - Fix forward by correcting the SQL error in a patch script.
   - If manual cleanup is required, run the corresponding `down.sql` rollback statements.

---

## Incident 5: Bad Payroll Run (Incorrect Calculation or Disbursement Halt)

### Symptoms:
- Discrepancy discovered in calculated net salaries or GOSI deductions before or during bank transmission.

### Remediation Steps:
1. **Halt Bank File Generation / Transmission**:
   - Ensure the run status is NOT transitioned to `posted` or `paid`.
2. **Lock the Faulty Run**:
   ```sql
   UPDATE public.payroll_runs 
   SET status = 'cancelled', 
       locked_snapshot = jsonb_build_object('cancellation_reason', 'Discrepancy detected before disbursement', 'cancelled_at', now())
   WHERE id = '<FAULTY_RUN_ID>' AND status IN ('draft', 'review', 'approved');
   ```
3. **Audit Input Snapshots**:
   - Inspect `payroll_inputs` for corrupted attendance penalties, unapproved overtime, or incorrect loan deduction numbers.
4. **Re-prepare New Payroll Draft**:
   - Correct input snapshots.
   - Run `preparePayrollDraftFn` to generate a fresh verified run.

---

## Incident 6: Duplicate Integration Event (Biometric / Attendance)

### Symptoms:
- Device sends identical biometric punches repeatedly, or webhook fires multiple times.

### Remediation Steps:
1. **Verify Idempotency Defense**:
   - `m08_raw_punches` enforces `UNIQUE(company_id, device_id, biometric_user_id, punch_time)`. Duplicate records are automatically rejected or ignored.
2. **Query Ingestion Log**:
   ```sql
   SELECT biometric_user_id, punch_time, count(*)
   FROM public.m08_raw_punches
   WHERE punch_time > now() - interval '24 hours'
   GROUP BY biometric_user_id, punch_time
   HAVING count(*) > 1; -- MUST RETURN 0 ROWS
   ```
3. **Reset Ingestion State if Webhook is Blocked**:
   - If external device queue is stalled due to a 500 error, inspect server logs, fix the payload parsing, and acknowledge the event.

---

## Incident 7: Storage Failure (File Upload / Download Broken)

### Symptoms:
- Document downloads fail with 403 / 404 or upload fails with storage quota exceeded.

### Remediation Steps:
1. **Verify Storage Bucket Permissions & RLS**:
   ```sql
   SELECT name, public FROM storage.buckets WHERE id IN ('employee-documents', 'employee-permits');
   ```
2. **Test Signed URL Generation**:
   - Call `generateSignedUrl` with 60-second TTL.
   - Check if the signed URL token signature matches the Supabase storage secret.
3. **Inspect Storage Quota / Disk Space**:
   - Check Supabase project storage metrics in dashboard.

---

## Incident 8: Security Incident (Compromised Account / Unauthorized Access)

### Symptoms:
- Unusual spike in `permission_denied` or `unauthorized_access` events.
- Suspicious admin activity detected in `security_audit_logs`.

### Remediation Steps:
1. **Immediate Account Isolation**:
   ```sql
   UPDATE public.profiles 
   SET is_active = false, updated_at = now()
   WHERE id = '<SUSPICIOUS_USER_ID>';
   ```
2. **Revoke Active User Sessions**:
   - Invalidate refresh tokens in Supabase Auth:
     ```sql
     DELETE FROM auth.sessions WHERE user_id = '<SUSPICIOUS_USER_ID>';
     DELETE FROM auth.refresh_tokens WHERE session_id IN (
       SELECT id FROM auth.sessions WHERE user_id = '<SUSPICIOUS_USER_ID>'
     );
     ```
3. **Query Immutable Audit Trail**:
   ```sql
   SELECT created_at, actor_email, event_type, resource, action, ip_address, details
   FROM public.security_audit_logs
   WHERE user_id = '<SUSPICIOUS_USER_ID>' OR created_at > now() - interval '24 hours'
   ORDER BY created_at DESC;
   ```
4. **Trigger Credential Rotation**:
   - Rotate `SUPABASE_SERVICE_ROLE_KEY` and `EMAIL_CONFIG_ENCRYPTION_KEY` as documented in `BACKUP_AND_DISASTER_RECOVERY.md`.
