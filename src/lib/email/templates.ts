import type { EmailTemplate, WorkflowEmailEvent } from "./types";
import {
  DEFAULT_TEMPLATES as RAW_TEMPLATES,
  wrapHtmlLayout as rawWrapHtmlLayout,
  interpolateVariables as rawInterpolateVariables,
  renderEmail as rawRenderEmail,
} from "./templates.mjs";

export const DEFAULT_TEMPLATES = RAW_TEMPLATES as Record<
  string,
  Omit<EmailTemplate, "createdAt" | "updatedAt">
>;

export const wrapHtmlLayout = rawWrapHtmlLayout as (
  content: string,
  options?: { language?: "ar" | "en"; companyName?: string; title?: string }
) => string;

export const interpolateVariables = rawInterpolateVariables as (
  templateText: string,
  event: WorkflowEmailEvent
) => string;

export const renderEmail = rawRenderEmail as (
  event: WorkflowEmailEvent,
  customTemplate?: EmailTemplate
) => { subject: string; html: string; text: string };
