/**
 * Server-only authorization helpers.
 *
 * Role checks always run against the database with the caller's own token
 * (`has_role`), never against client-supplied data such as an email address,
 * a request body field or anything in localStorage.
 */
import { logSecurityEvent, SafeError } from "./security.server";

// Structural type: any Supabase client bound to the caller's own token.
export type AuthedClient = {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "teacher" | "student" }) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function hasRole(supabase: AuthedClient, userId: string, role: "admin" | "teacher") {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  if (error) {
    console.error("[authz] has_role failed", error.message);
    throw new SafeError("We could not verify your permissions. Please sign in again.");
  }
  return data === true;
}

/** Requires the caller to be an administrator. Denials are audited. */
export async function assertAdmin(supabase: AuthedClient, userId: string, action = "unknown") {
  if (await hasRole(supabase, userId, "admin")) return;
  await logSecurityEvent({
    event: "authz_denied_admin",
    severity: "warning",
    userId,
    detail: { action },
  });
  throw new SafeError("Forbidden: administrator access is required.");
}

/** Requires the caller to be a teacher or administrator. Denials are audited. */
export async function assertStaff(supabase: AuthedClient, userId: string, action = "unknown") {
  if ((await hasRole(supabase, userId, "admin")) || (await hasRole(supabase, userId, "teacher"))) return;
  await logSecurityEvent({
    event: "authz_denied_staff",
    severity: "warning",
    userId,
    detail: { action },
  });
  throw new SafeError("Only teachers or administrators can do that.");
}
