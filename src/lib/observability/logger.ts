/**
 * HRMS Enterprise Observability & Structured Logging Engine.
 * 
 * Enforces:
 * - 4 Alert Levels: INFO, WARNING, ERROR, CRITICAL
 * - Automated Redaction of Secrets, Tokens, Passwords, and Sensitive Employee PII
 * - Domain Event Observability (Auth, Permissions, Server, DB, Email, Workflow, Payroll, Attendance, Slow Ops)
 * - Structured JSON output
 */

export type AlertLevel = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ObservabilityEventType =
  | "auth_failure"
  | "permission_denied"
  | "server_error"
  | "database_failure"
  | "email_failure"
  | "workflow_failure"
  | "payroll_failure"
  | "attendance_ingestion_failure"
  | "slow_operation"
  | "operational_lifecycle";

export interface LogEntry {
  timestamp: string;
  level: AlertLevel;
  eventType: ObservabilityEventType;
  message: string;
  tenantId?: string | null;
  userId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, any>;
}

// Regex patterns to identify sensitive keys and values that MUST be redacted
const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|bearer|key|authorization|service_role|cookie|private|credential|api_key|encryption_key|iban|national_id|basic_salary|gross_salary|net_salary)/i;

/**
 * Deeply scrubs secrets, passwords, tokens, and sensitive PII from any payload.
 */
export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Redact JWT tokens: eyJ...
    if (/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(data)) {
      return "[REDACTED_JWT_TOKEN]";
    }
    // Redact Bearer tokens
    if (/^Bearer\s+/i.test(data)) {
      return "Bearer [REDACTED_TOKEN]";
    }
    // Redact Supabase service-role keys: sb_secret_ or similar
    if (data.includes("service_role") || (data.startsWith("eyJ") && data.length > 50)) {
      return "[REDACTED_SECRET]";
    }
    return data;
  }

  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = redactSensitiveData(value);
    } else if (typeof value === "string") {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Creates a structured, sanitized log entry.
 */
export function createLogEntry(
  level: AlertLevel,
  eventType: ObservabilityEventType,
  message: string,
  options: {
    tenantId?: string | null;
    userId?: string | null;
    durationMs?: number | null;
    metadata?: Record<string, any>;
  } = {}
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    eventType,
    message,
    tenantId: options.tenantId || null,
    userId: options.userId || null,
    durationMs: options.durationMs !== undefined ? options.durationMs : null,
    metadata: redactSensitiveData(options.metadata || {}),
  };
}

/**
 * Structured Logger with Alert Routing.
 */
class Logger {
  private log(entry: LogEntry): void {
    const formatted = JSON.stringify(entry);
    switch (entry.level) {
      case "CRITICAL":
      case "ERROR":
        console.error(formatted);
        break;
      case "WARNING":
        console.warn(formatted);
        break;
      case "INFO":
      default:
        console.log(formatted);
        break;
    }
  }

  info(eventType: ObservabilityEventType, message: string, options = {}) {
    const entry = createLogEntry("INFO", eventType, message, options);
    this.log(entry);
    return entry;
  }

  warn(eventType: ObservabilityEventType, message: string, options = {}) {
    const entry = createLogEntry("WARNING", eventType, message, options);
    this.log(entry);
    return entry;
  }

  error(eventType: ObservabilityEventType, message: string, options = {}) {
    const entry = createLogEntry("ERROR", eventType, message, options);
    this.log(entry);
    return entry;
  }

  critical(eventType: ObservabilityEventType, message: string, options = {}) {
    const entry = createLogEntry("CRITICAL", eventType, message, options);
    this.log(entry);
    return entry;
  }

  /**
   * Tracks operation latency and logs slow operations (> 500ms).
   */
  trackDuration(name: string, durationMs: number, options: { tenantId?: string; userId?: string; metadata?: Record<string, any> } = {}) {
    if (durationMs > 500) {
      return this.warn("slow_operation", `Slow operation detected: ${name} took ${durationMs}ms (threshold: 500ms)`, {
        ...options,
        durationMs,
        metadata: { ...options.metadata, operation: name },
      });
    }
    return null;
  }
}

export const logger = new Logger();
