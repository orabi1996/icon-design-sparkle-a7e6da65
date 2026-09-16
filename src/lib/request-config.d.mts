export type RequestCategory = "شؤون موظفين" | "مالية" | "إدارية" | "عمليات";
export type RequestStatus = "نشط" | "معطل";
export type RequestTypeConfig = {
  id: string;
  code: string;
  name: string;
  category: RequestCategory;
  approval_chain: string[];
  max_sla_hours: number;
  requires_attachment: boolean;
  allow_cancel: boolean;
  status: RequestStatus;
};
export type RequestConfigValidation =
  | { ok: true; errors: Record<string, never>; value: RequestTypeConfig }
  | { ok: false; errors: Record<string, string>; value?: never };
export const REQUEST_CATEGORIES: readonly RequestCategory[];
export const REQUEST_STATUSES: readonly RequestStatus[];
export const DEFAULT_REQUEST_TYPES: readonly RequestTypeConfig[];
export function validateRequestConfig(input: unknown): RequestConfigValidation;
export function parseRequestConfigs(raw?: string): {
  configs: RequestTypeConfig[];
  invalidCount: number;
  source: "defaults" | "saved";
};
export function serializeRequestConfigs(configs: readonly RequestTypeConfig[]): string;
export function splitApprovalChain(value: string): string[];
