import { apiFetch } from "./client";

export interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

/** Two-step sign-in with an authenticator app, for the signed-in person. */
export const mfaApi = {
  status: () => apiFetch<MfaStatus>("/auth/mfa"),
  setup: () => apiFetch<{ secret: string; otpauthUrl: string }>("/auth/mfa/setup", { method: "POST" }),
  enable: (code: string) => apiFetch<{ recoveryCodes: string[] }>("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disable: (password: string, code: string) => apiFetch<void>("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password, code }) }),
  recoveryCodes: (code: string) =>
    apiFetch<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: JSON.stringify({ code }) }),
  requireForOrganisation: (required: boolean) =>
    apiFetch<{ required: boolean; membersWithout: number }>("/auth/mfa/organisation", { method: "PUT", body: JSON.stringify({ required }) }),
};
