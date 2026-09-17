// Enterprise Authentication & Registration Configuration

/**
 * Checks whether self-registration is allowed in this HRMS instance.
 * Defaults to `false` for enterprise safety — accounts must be created by an Admin.
 */
export function isSelfRegistrationAllowed(): boolean {
  // Check build-time or runtime environment flag
  const envVal =
    typeof process !== "undefined" && process.env?.["ALLOW_SELF_REGISTRATION"]
      ? process.env["ALLOW_SELF_REGISTRATION"]
      : typeof import.meta !== "undefined" &&
          (import.meta as unknown as { env?: Record<string, string> }).env?.[
            "VITE_ALLOW_SELF_REGISTRATION"
          ];

  return envVal === "true";
}
