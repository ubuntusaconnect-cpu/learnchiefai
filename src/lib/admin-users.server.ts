/** Server-only helpers for administrative user management. */

/** Appends a tamper-resistant entry to the administrative audit log. */
export async function audit(input: {
  adminId: string;
  action: string;
  subjectUserId?: string | null;
  recordType?: string | null;
  recordId?: string | null;
  success?: boolean;
  detail?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: input.adminId,
      action: input.action.slice(0, 80),
      subject_user_id: input.subjectUserId ?? null,
      record_type: input.recordType ?? null,
      record_id: input.recordId ?? null,
      success: input.success ?? true,
      detail: input.detail ? input.detail.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("[admin-audit] failed to write audit entry", err);
  }
}
