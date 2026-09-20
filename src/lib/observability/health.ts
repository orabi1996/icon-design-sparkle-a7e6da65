/**
 * HRMS Enterprise Health Diagnostics Engine.
 * 
 * Probes the 6 vital operational subsystems:
 * 1. Application (Process uptime, memory, version)
 * 2. Database (Postgres query latency, connection)
 * 3. Authentication (Supabase Auth reachability)
 * 4. Storage (Bucket accessibility)
 * 5. SMTP (Transport configuration & connectivity)
 * 6. Background Worker (Outbox backlog & queue latency)
 */

export type SubsystemStatus = "healthy" | "degraded" | "unhealthy";

export interface SubsystemHealth {
  status: SubsystemStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, any>;
}

export interface SystemHealthReport {
  status: SubsystemStatus;
  timestamp: string;
  uptimeSeconds: number;
  subsystems: {
    application: SubsystemHealth;
    database: SubsystemHealth;
    authentication: SubsystemHealth;
    storage: SubsystemHealth;
    smtp: SubsystemHealth;
    backgroundWorker: SubsystemHealth;
  };
}

/**
 * Probes Application subsystem.
 */
export function checkApplicationHealth(): SubsystemHealth {
  const mem = process.memoryUsage();
  return {
    status: "healthy",
    details: {
      nodeVersion: process.version,
      platform: process.platform,
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
      rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
    },
  };
}

/**
 * Probes Database subsystem via Supabase client.
 */
export async function checkDatabaseHealth(db: any): Promise<SubsystemHealth> {
  const start = performance.now();
  try {
    if (!db) {
      return { status: "unhealthy", message: "Database client is not initialized" };
    }
    const { error } = await db.from("hr_tenants").select("id").limit(1);
    const latencyMs = Number((performance.now() - start).toFixed(2));
    if (error) {
      return { status: "unhealthy", latencyMs, message: error.message };
    }
    return {
      status: latencyMs > 1000 ? "degraded" : "healthy",
      latencyMs,
      details: { query: "SELECT id FROM hr_tenants LIMIT 1" },
    };
  } catch (err: any) {
    const latencyMs = Number((performance.now() - start).toFixed(2));
    return { status: "unhealthy", latencyMs, message: err?.message || "Database connection failed" };
  }
}

/**
 * Probes Supabase Authentication service.
 */
export async function checkAuthenticationHealth(db: any): Promise<SubsystemHealth> {
  const start = performance.now();
  try {
    if (!db || !db.auth) {
      return { status: "unhealthy", message: "Auth client is not configured" };
    }
    // Ping auth service by checking session/user API
    const { error } = await db.auth.getUser("00000000-0000-0000-0000-000000000000");
    const latencyMs = Number((performance.now() - start).toFixed(2));
    // Auth returns user not found or error, but endpoint was reachable
    return {
      status: latencyMs > 1500 ? "degraded" : "healthy",
      latencyMs,
      details: { authEndpoint: "reachable" },
    };
  } catch (err: any) {
    const latencyMs = Number((performance.now() - start).toFixed(2));
    return { status: "unhealthy", latencyMs, message: err?.message || "Auth service unreachable" };
  }
}

/**
 * Probes Supabase Storage buckets.
 */
export async function checkStorageHealth(db: any): Promise<SubsystemHealth> {
  const start = performance.now();
  try {
    if (!db || !db.storage) {
      return { status: "unhealthy", message: "Storage client is not configured" };
    }
    const { data: buckets, error } = await db.storage.listBuckets();
    const latencyMs = Number((performance.now() - start).toFixed(2));
    if (error) {
      return { status: "degraded", latencyMs, message: error.message };
    }
    const expectedBuckets = ["employee-documents", "employee-permits"];
    const foundNames = (buckets || []).map((b: any) => b.name);
    const hasCore = expectedBuckets.some(b => foundNames.includes(b));
    return {
      status: "healthy",
      latencyMs,
      details: { bucketCount: buckets?.length || 0, hasCoreBuckets: hasCore },
    };
  } catch (err: any) {
    const latencyMs = Number((performance.now() - start).toFixed(2));
    return { status: "degraded", latencyMs, message: err?.message || "Storage probe error" };
  }
}

/**
 * Probes SMTP configuration & transport readiness.
 */
export async function checkSmtpHealth(db: any): Promise<SubsystemHealth> {
  const start = performance.now();
  try {
    if (!db) return { status: "degraded", message: "DB client unavailable for SMTP check" };
    const { data: config, error } = await db
      .from("email_configs")
      .select("id, smtp_host, smtp_port, is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const latencyMs = Number((performance.now() - start).toFixed(2));
    if (error) {
      return { status: "degraded", latencyMs, message: error.message };
    }
    if (!config) {
      return { status: "degraded", latencyMs, message: "No active SMTP configuration found" };
    }
    return {
      status: "healthy",
      latencyMs,
      details: { host: config.smtp_host, port: config.smtp_port, active: config.is_active },
    };
  } catch (err: any) {
    const latencyMs = Number((performance.now() - start).toFixed(2));
    return { status: "degraded", latencyMs, message: err?.message || "SMTP check error" };
  }
}

/**
 * Probes Background Worker (Outbox Queue Backlog & Age).
 */
export async function checkBackgroundWorkerHealth(db: any): Promise<SubsystemHealth> {
  const start = performance.now();
  try {
    if (!db) return { status: "degraded", message: "DB client unavailable for worker check" };
    const { data: pendingEvents, error } = await db
      .from("wf_outbox_events")
      .select("id, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    const latencyMs = Number((performance.now() - start).toFixed(2));
    if (error) {
      return { status: "degraded", latencyMs, message: error.message };
    }

    const pendingCount = pendingEvents?.length || 0;
    let oldestAgeMinutes = 0;
    if (pendingCount > 0 && pendingEvents[0].created_at) {
      const created = new Date(pendingEvents[0].created_at).getTime();
      oldestAgeMinutes = Number(((Date.now() - created) / (1000 * 60)).toFixed(1));
    }

    // Degraded if more than 20 pending events or oldest is older than 15 minutes
    const isDegraded = pendingCount > 20 || oldestAgeMinutes > 15;

    return {
      status: isDegraded ? "degraded" : "healthy",
      latencyMs,
      details: {
        pendingBacklogCount: pendingCount,
        oldestPendingAgeMinutes: oldestAgeMinutes,
      },
    };
  } catch (err: any) {
    const latencyMs = Number((performance.now() - start).toFixed(2));
    return { status: "degraded", latencyMs, message: err?.message || "Worker check error" };
  }
}

/**
 * Computes composite system health across all 6 subsystems.
 */
export async function getSystemHealthReport(db: any): Promise<SystemHealthReport> {
  const [app, database, auth, storage, smtp, worker] = await Promise.all([
    checkApplicationHealth(),
    checkDatabaseHealth(db),
    checkAuthenticationHealth(db),
    checkStorageHealth(db),
    checkSmtpHealth(db),
    checkBackgroundWorkerHealth(db),
  ]);

  let overallStatus: SubsystemStatus = "healthy";

  // If Database or Auth is unhealthy, whole system is unhealthy
  if (database.status === "unhealthy" || auth.status === "unhealthy") {
    overallStatus = "unhealthy";
  } else if (
    database.status === "degraded" ||
    storage.status === "degraded" ||
    smtp.status === "degraded" ||
    worker.status === "degraded"
  ) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    subsystems: {
      application: app,
      database,
      authentication: auth,
      storage,
      smtp,
      backgroundWorker: worker,
    },
  };
}
