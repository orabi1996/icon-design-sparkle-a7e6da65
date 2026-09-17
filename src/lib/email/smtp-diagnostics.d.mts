export function translateSmtpError(error: unknown): {
  message: string;
  code: string;
  details: string;
};
