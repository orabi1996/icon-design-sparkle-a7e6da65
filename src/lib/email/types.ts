export type SmtpEncryption = "none" | "ssl" | "tls" | "starttls";

export type EmailSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  fromEmail: string;
  fromName: string;
  username: string;
  password?: string | undefined;
  passwordMasked?: string | undefined;
  hasPassword?: boolean | undefined;
  replyTo?: string | undefined;
  timeoutSeconds: number;
  maxRetries: number;
};

export type EmailRulesConfig = {
  notifyOnCreated: boolean;
  notifyOnStageAssigned: boolean;
  notifyOnStageApproved: boolean;
  notifyOnStageRejected: boolean;
  notifyOnFinalApproved: boolean;
  notifyOnCancelled: boolean;
  notifyOnInquiry: boolean;
  notifyRequester: boolean;
  notifyApprover: boolean;
};

export type EmailTemplate = {
  id: string;
  name: string;
  eventType: string;
  requestType: string;
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
};

export type WorkflowEventType =
  | "request_created"
  | "stage_assigned"
  | "stage_approved"
  | "stage_rejected"
  | "final_approved"
  | "request_cancelled"
  | "inquiry_issued"
  | "test_email"
  | (string & {});

export type WorkflowEmailEvent = {
  eventType: WorkflowEventType;
  requestId?: string | undefined;
  requestNumber?: string | number | undefined;
  requestType: string;
  employeeId?: string | undefined;
  employeeName?: string | undefined;
  employeeCode?: string | undefined;
  employeeEmail?: string | undefined;
  currentStage?: string | undefined;
  previousStage?: string | undefined;
  nextStage?: string | undefined;
  currentStatus?: string | undefined;
  approverRole?: string | undefined;
  approverName?: string | undefined;
  approverEmail?: string | undefined;
  actionBy?: string | undefined;
  actionDate?: string | undefined;
  rejectionReason?: string | undefined;
  amount?: number | string | undefined;
  leaveFrom?: string | undefined;
  leaveTo?: string | undefined;
  days?: number | string | undefined;
  actionUrl?: string | undefined;
  inquiryName?: string | undefined;
  inquiryType?: string | undefined;
  inquiryDate?: string | undefined;
  companyName?: string | undefined;
  language?: "ar" | "en" | undefined;
  dedupKey?: string | undefined;
};

export type EmailLogStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "skipped_no_email";

export type EmailLogItem = {
  id: string;
  createdAt: string;
  sentAt: string | null;
  recipientEmail: string;
  recipientName: string | null;
  senderEmail: string | null;
  senderName: string | null;
  subject: string;
  bodyHtml?: string | null | undefined;
  bodyText?: string | null | undefined;
  requestType: string | null;
  requestId: string | null;
  requestNumber: string | null;
  eventType: string;
  templateKey: string | null;
  language: string;
  status: EmailLogStatus;
  attempts: number;
  lastError: string | null;
  messageId: string | null;
  dedupKey?: string | null | undefined;
};

export type TestConnectionResult = {
  ok: boolean;
  message: string;
  code?: string | undefined;
  details?: string | undefined;
};

export type SendEmailResult = {
  ok: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
};
