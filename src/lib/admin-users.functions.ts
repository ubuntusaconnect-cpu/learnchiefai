import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Severity = z.enum(["low", "medium", "high"]);

const IssueWarningInput = z.object({
  userId: z.string().uuid(),
  category: z.string().min(2).max(80),
  severity: Severity,
  reason: z.string().min(3).max(300),
  message: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const WarningActionInput = z.object({
  warningId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const StatusInput = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "inactive", "suspended"]),
  reason: z.string().max(300).optional(),
});

/** Issues a formal administrative warning. Admin-only; audited. */
export const issueWarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IssueWarningInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertAdmin } = await import("./authz.server");
    const { enforceRateLimit, RATE_LIMITS, SafeError, toClientError } = await import("./security.server");
    const { audit } = await import("./admin-users.server");
    try {
      await assertAdmin(supabase, userId, "issue_warning");
      await enforceRateLimit(RATE_LIMITS.adminWrite, userId);
      if (data.userId === userId) throw new SafeError("You cannot issue a warning to yourself.");

      const { data: row, error } = await supabase
        .from("user_warnings")
        .insert({
          user_id: data.userId,
          issued_by: userId,
          category: data.category,
          severity: data.severity,
          reason: data.reason,
          message: data.message ?? null,
          expires_at: data.expiresAt ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      await audit({
        adminId: userId,
        action: "warning_issued",
        subjectUserId: data.userId,
        recordType: "user_warning",
        recordId: row.id,
        detail: `${data.severity} / ${data.category}`,
      });
      return { id: row.id };
    } catch (err) {
      throw toClientError(err, "issueWarning");
    }
  });

/** Marks a warning as resolved. The record is never deleted. */
export const resolveWarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WarningActionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertAdmin } = await import("./authz.server");
    const { enforceRateLimit, RATE_LIMITS, toClientError } = await import("./security.server");
    const { audit } = await import("./admin-users.server");
    try {
      await assertAdmin(supabase, userId, "resolve_warning");
      await enforceRateLimit(RATE_LIMITS.adminWrite, userId);
      const { data: row, error } = await supabase
        .from("user_warnings")
        .update({ resolved_at: new Date().toISOString(), resolved_by: userId, resolution_note: data.note ?? null })
        .eq("id", data.warningId)
        .is("revoked_at", null)
        .select("user_id")
        .single();
      if (error) throw error;
      await audit({
        adminId: userId,
        action: "warning_resolved",
        subjectUserId: row.user_id,
        recordType: "user_warning",
        recordId: data.warningId,
        detail: data.note ?? null,
      });
      return { ok: true };
    } catch (err) {
      throw toClientError(err, "resolveWarning");
    }
  });

/** Revokes a warning issued in error. The record and its history are kept. */
export const revokeWarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WarningActionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertAdmin } = await import("./authz.server");
    const { enforceRateLimit, RATE_LIMITS, toClientError } = await import("./security.server");
    const { audit } = await import("./admin-users.server");
    try {
      await assertAdmin(supabase, userId, "revoke_warning");
      await enforceRateLimit(RATE_LIMITS.adminWrite, userId);
      const { data: row, error } = await supabase
        .from("user_warnings")
        .update({ revoked_at: new Date().toISOString(), revoked_by: userId, revocation_note: data.note ?? null })
        .eq("id", data.warningId)
        .select("user_id")
        .single();
      if (error) throw error;
      await audit({
        adminId: userId,
        action: "warning_revoked",
        subjectUserId: row.user_id,
        recordType: "user_warning",
        recordId: data.warningId,
        detail: data.note ?? null,
      });
      return { ok: true };
    } catch (err) {
      throw toClientError(err, "revokeWarning");
    }
  });

/** Suspends, reactivates or deactivates an account. Admin-only; audited. */
export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertAdmin } = await import("./authz.server");
    const { enforceRateLimit, RATE_LIMITS, SafeError, toClientError } = await import("./security.server");
    const { audit } = await import("./admin-users.server");
    try {
      await assertAdmin(supabase, userId, "set_account_status");
      await enforceRateLimit(RATE_LIMITS.adminWrite, userId);
      if (data.userId === userId) throw new SafeError("You cannot change your own account status.");

      const { error } = await supabase
        .from("profiles")
        .update({
          account_status: data.status,
          status_reason: data.reason ?? null,
          status_changed_at: new Date().toISOString(),
          status_changed_by: userId,
        })
        .eq("id", data.userId);
      if (error) throw error;

      await audit({
        adminId: userId,
        action: data.status === "suspended" ? "user_suspended" : data.status === "active" ? "user_reactivated" : "user_deactivated",
        subjectUserId: data.userId,
        recordType: "profile",
        recordId: data.userId,
        detail: data.reason ?? null,
      });
      return { ok: true };
    } catch (err) {
      throw toClientError(err, "setAccountStatus");
    }
  });
