import type { EmailTemplate, WorkflowEmailEvent } from "./types";

export const DEFAULT_TEMPLATES: Record<string, Omit<EmailTemplate, "createdAt" | "updatedAt">>;

export function wrapHtmlLayout(
  content: string,
  options?: { language?: "ar" | "en"; companyName?: string; title?: string }
): string;

export function interpolateVariables(
  templateText: string,
  event: WorkflowEmailEvent
): string;

export function renderEmail(
  event: WorkflowEmailEvent,
  customTemplate?: EmailTemplate
): { subject: string; html: string; text: string };
