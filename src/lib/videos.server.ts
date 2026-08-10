// Server-only helpers for the video learning system.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Verify the caller really is an admin (server-side authorization). */
export async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Could not verify your permissions: ${error.message}`);
  if (data !== true) throw new Error("Forbidden: administrator access is required.");
}

async function findOrCreateNode(
  kind: string,
  name: string,
  grade: number | null,
  parentId: string | null,
): Promise<string> {
  const q = supabaseAdmin.from("curriculum_nodes").select("id").eq("kind", kind).ilike("name", name);
  const { data: found } = parentId ? await q.eq("parent_id", parentId) : await q.is("parent_id", null);
  if (found && found.length) return found[0]!.id;
  const { data, error } = await supabaseAdmin
    .from("curriculum_nodes")
    .insert({ kind, name, grade, parent_id: parentId })
    .select("id")
    .single();
  if (error) throw new Error(`Could not organise the curriculum entry "${name}": ${error.message}`);
  return data.id;
}

/**
 * Places content in the Grade -> Subject -> Section -> Topic -> Subtopic tree,
 * creating any missing nodes. Returns the deepest node id.
 */
export async function ensureCurriculumPath(opts: {
  grade: number;
  subject: string;
  section?: string | null;
  topic?: string | null;
  subtopic?: string | null;
}): Promise<string> {
  const gradeId = await findOrCreateNode("grade", `Grade ${opts.grade}`, opts.grade, null);
  let deepest = await findOrCreateNode("subject", opts.subject, opts.grade, gradeId);
  if (opts.section) deepest = await findOrCreateNode("section", opts.section, opts.grade, deepest);
  if (opts.topic) deepest = await findOrCreateNode("topic", opts.topic, opts.grade, deepest);
  if (opts.subtopic) deepest = await findOrCreateNode("subtopic", opts.subtopic, opts.grade, deepest);
  return deepest;
}

export function lowConfidence(confidence: Record<string, number> | null | undefined): boolean {
  if (!confidence) return true;
  const keys = ["grade", "subject", "topic"];
  return keys.some((k) => (confidence[k] ?? 0) < 80);
}
