import { createServerFn } from "@tanstack/react-start";
import { getSystemHealthReport, type SystemHealthReport } from "./observability/health";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * Server Function: Get System Health Report across 6 vital subsystems.
 * Accessible for monitoring/probes without requiring prior authentication.
 */
export const getSystemHealthFn = createServerFn({ method: "GET" })
  .handler(async (): Promise<SystemHealthReport> => {
    try {
      const db = await getAdminDb();
      return await getSystemHealthReport(db);
    } catch (err: any) {
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        subsystems: {
          application: { status: "healthy" },
          database: { status: "unhealthy", message: err?.message || "Failed to connect to database" },
          authentication: { status: "unhealthy", message: "Auth probe unreachable" },
          storage: { status: "degraded", message: "Storage probe not executed" },
          smtp: { status: "degraded", message: "SMTP probe not executed" },
          backgroundWorker: { status: "degraded", message: "Worker probe not executed" },
        },
      };
    }
  });
