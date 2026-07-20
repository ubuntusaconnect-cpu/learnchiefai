import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProviderKeyEnum = z.enum(["lovable", "gemini", "groq", "openrouter", "openai", "anthropic", "mistral"]);

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Admins only.");
}

// ── List providers (with masked key preview + status) ──────────────────────
export const listAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PROVIDER_META, ALL_PROVIDER_KEYS, providerHasKey } = await import("./ai-gateway.server");

    const { data: configs } = await supabaseAdmin
      .from("ai_provider_configs").select("*").order("priority", { ascending: true });

    const { data: secrets } = await supabaseAdmin
      .from("ai_provider_secrets").select("provider_key, api_key, updated_at");

    const secretMap = new Map((secrets ?? []).map((s) => [s.provider_key, s]));

    // Ensure every supported provider appears (even if row missing)
    const byKey = new Map((configs ?? []).map((c) => [c.provider_key, c]));
    const rows = [];
    for (const key of ALL_PROVIDER_KEYS) {
      const cfg = byKey.get(key);
      const has = await providerHasKey(key);
      const sec = secretMap.get(key);
      const maskedKey = sec?.api_key
        ? `${sec.api_key.slice(0, 4)}••••${sec.api_key.slice(-4)}`
        : null;
      rows.push({
        providerKey: key,
        name: PROVIDER_META[key].name,
        envVar: PROVIDER_META[key].envVar,
        docsUrl: PROVIDER_META[key].docsUrl,
        defaultModel: PROVIDER_META[key].defaultModel,
        enabled: cfg?.enabled ?? true,
        priority: cfg?.priority ?? 100,
        model: cfg?.model ?? PROVIDER_META[key].defaultModel,
        hasKey: has,
        keySource: sec?.api_key ? ("database" as const) : (has ? ("env" as const) : null),
        maskedKey,
        lastTestOk: cfg?.last_test_ok ?? null,
        lastTestError: cfg?.last_test_error ?? null,
        lastTestAt: cfg?.last_test_at ?? null,
        lastTestLatencyMs: cfg?.last_test_latency_ms ?? null,
        updatedAt: cfg?.updated_at ?? null,
      });
    }
    // Sort by priority ascending (matches the actual failover order)
    rows.sort((a, b) => a.priority - b.priority);
    return rows;
  });

// ── Save/update provider config + optional API key ────────────────────────
const UpsertInput = z.object({
  providerKey: ProviderKeyEnum,
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  model: z.string().max(200).optional().nullable(),
  apiKey: z.string().trim().min(1).max(2000).optional().nullable(),
});

export const upsertAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Update the API key first (if provided)
    if (data.apiKey !== undefined && data.apiKey !== null && data.apiKey !== "") {
      const { error } = await supabaseAdmin.from("ai_provider_secrets").upsert({
        provider_key: data.providerKey,
        api_key: data.apiKey,
      }, { onConflict: "provider_key" });
      if (error) throw error;
    }

    // Compute has_key for the config row
    const hasKey =
      data.providerKey === "lovable"
        ? !!process.env.LOVABLE_API_KEY
        : !!(await supabaseAdmin
              .from("ai_provider_secrets").select("provider_key")
              .eq("provider_key", data.providerKey).maybeSingle()).data
          || !!process.env[
            ({ gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY",
              openai: "OPENAI_API_KEY", anthropic: "CLAUDE_API_KEY", mistral: "MISTRAL_API_KEY" } as any)[data.providerKey]
          ];

    const patch: Record<string, unknown> = { has_key: hasKey };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.model !== undefined) patch.model = data.model;

    const { error } = await supabaseAdmin
      .from("ai_provider_configs")
      .update(patch)
      .eq("provider_key", data.providerKey);
    if (error) throw error;

    return { ok: true };
  });

// ── Delete stored API key (env-based keys are unaffected) ─────────────────
export const deleteAiProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ providerKey: ProviderKeyEnum }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_provider_secrets").delete().eq("provider_key", data.providerKey);

    // Recompute has_key from env
    const envMap: Record<string, string> = {
      gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY",
      openai: "OPENAI_API_KEY", anthropic: "CLAUDE_API_KEY", mistral: "MISTRAL_API_KEY",
      lovable: "LOVABLE_API_KEY",
    };
    const hasKey = !!process.env[envMap[data.providerKey]];
    await supabaseAdmin.from("ai_provider_configs").update({ has_key: hasKey }).eq("provider_key", data.providerKey);
    return { ok: true };
  });

// ── Reorder providers (drag/drop or up/down) ──────────────────────────────
export const reorderAiProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order: z.array(ProviderKeyEnum).min(1).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < data.order.length; i++) {
      await supabaseAdmin.from("ai_provider_configs")
        .update({ priority: (i + 1) * 10 })
        .eq("provider_key", data.order[i]);
    }
    return { ok: true };
  });

// ── Test connection ───────────────────────────────────────────────────────
export const testAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ providerKey: ProviderKeyEnum }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { testProviderConnection } = await import("./ai-gateway.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const result = await testProviderConnection(data.providerKey);
    await supabaseAdmin.from("ai_provider_configs").update({
      last_test_ok: result.ok,
      last_test_error: result.error ?? null,
      last_test_at: new Date().toISOString(),
      last_test_latency_ms: result.latencyMs,
    }).eq("provider_key", data.providerKey);
    return result;
  });

// ── Analytics summary ─────────────────────────────────────────────────────
export const getAiStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [{ data: today }, { data: month }, { data: recent }] = await Promise.all([
      supabaseAdmin.from("ai_request_logs").select("status, cached, tokens_in, tokens_out, provider, duration_ms")
        .gte("created_at", startOfDay.toISOString()),
      supabaseAdmin.from("ai_request_logs").select("status, cached, tokens_in, tokens_out, provider")
        .gte("created_at", startOfMonth.toISOString()),
      supabaseAdmin.from("ai_request_logs").select("provider, status, duration_ms, cached, created_at")
        .order("created_at", { ascending: false }).limit(500),
    ]);

    const sumTokens = (rows: any[] | null) =>
      (rows ?? []).reduce((acc, r) => ({
        in: acc.in + (r.tokens_in ?? 0),
        out: acc.out + (r.tokens_out ?? 0),
      }), { in: 0, out: 0 });

    const byProvider: Record<string, { success: number; error: number; cached: number; totalDur: number; count: number }> = {};
    for (const r of recent ?? []) {
      const p = r.provider;
      byProvider[p] ??= { success: 0, error: 0, cached: 0, totalDur: 0, count: 0 };
      if (r.status === "success") byProvider[p].success++;
      else if (r.status === "error") byProvider[p].error++;
      else if (r.status === "cached") byProvider[p].cached++;
      if (r.duration_ms) { byProvider[p].totalDur += r.duration_ms; byProvider[p].count++; }
    }

    const cacheHitsToday = (today ?? []).filter((r) => r.cached).length;
    const cacheMissesToday = (today ?? []).filter((r) => !r.cached && r.status !== "error").length;

    const monthTokens = sumTokens(month);
    // Rough estimate: $0.001 per 1K prompt tok, $0.003 per 1K completion tok — indicative only.
    const estCost = (monthTokens.in / 1000) * 0.001 + (monthTokens.out / 1000) * 0.003;

    return {
      requestsToday: (today ?? []).length,
      requestsThisMonth: (month ?? []).length,
      tokensThisMonth: monthTokens,
      estCostUsdThisMonth: Number(estCost.toFixed(4)),
      cacheHitsToday,
      cacheMissesToday,
      providerBreakdown: byProvider,
    };
  });

// ── Recent logs ───────────────────────────────────────────────────────────
export const listAiLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(500).default(200) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("ai_request_logs")
      .select("*").order("created_at", { ascending: false }).limit(data.limit);
    return rows ?? [];
  });
