// Server-only. Never import from client code.
// Unified AI gateway: normalizes providers, retries, fails over, caches, logs.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GatewayOptions {
  operation?: string;         // "chat" | "lesson-enhance" | "quiz-gen" | ...
  cache?: boolean;            // default true
  userId?: string | null;
  temperature?: number;
  maxTokens?: number;
  forceProvider?: string;     // override priority (used by test)
  forceModel?: string;
}

export interface GatewayResult {
  content: string;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  cached: boolean;
  attempts: Array<{ provider: string; error?: string; durationMs: number }>;
}

export type ProviderKey =
  | "lovable" | "gemini" | "groq" | "openrouter" | "openai" | "anthropic" | "mistral";

const ENV_KEY_MAP: Record<ProviderKey, string> = {
  lovable: "LOVABLE_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "CLAUDE_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

const DEFAULT_MODEL: Record<ProviderKey, string> = {
  lovable: "google/gemini-3.5-flash",
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.0-flash-exp:free",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  mistral: "mistral-small-latest",
};

export const PROVIDER_META: Record<ProviderKey, { name: string; envVar: string; defaultModel: string; docsUrl: string }> = {
  lovable:    { name: "Lovable AI",       envVar: "LOVABLE_API_KEY",    defaultModel: DEFAULT_MODEL.lovable,    docsUrl: "https://docs.lovable.dev" },
  gemini:     { name: "Google Gemini",    envVar: "GEMINI_API_KEY",     defaultModel: DEFAULT_MODEL.gemini,     docsUrl: "https://aistudio.google.com/apikey" },
  groq:       { name: "Groq",             envVar: "GROQ_API_KEY",       defaultModel: DEFAULT_MODEL.groq,       docsUrl: "https://console.groq.com/keys" },
  openrouter: { name: "OpenRouter",       envVar: "OPENROUTER_API_KEY", defaultModel: DEFAULT_MODEL.openrouter, docsUrl: "https://openrouter.ai/keys" },
  openai:     { name: "OpenAI",           envVar: "OPENAI_API_KEY",     defaultModel: DEFAULT_MODEL.openai,     docsUrl: "https://platform.openai.com/api-keys" },
  anthropic:  { name: "Anthropic Claude", envVar: "CLAUDE_API_KEY",     defaultModel: DEFAULT_MODEL.anthropic,  docsUrl: "https://console.anthropic.com/settings/keys" },
  mistral:    { name: "Mistral AI",       envVar: "MISTRAL_API_KEY",    defaultModel: DEFAULT_MODEL.mistral,    docsUrl: "https://console.mistral.ai/api-keys/" },
};

export const ALL_PROVIDER_KEYS: ProviderKey[] = ["lovable", "gemini", "groq", "openrouter", "openai", "anthropic", "mistral"];

// ────────────────────────────────────────────────────────────────
// Key resolution — DB first, then env var (LOVABLE_API_KEY is env-managed).
// ────────────────────────────────────────────────────────────────
async function getApiKey(provider: ProviderKey): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("ai_provider_secrets")
      .select("api_key")
      .eq("provider_key", provider)
      .maybeSingle();
    if (data?.api_key) return data.api_key;
  } catch { /* fall through to env */ }
  const envName = ENV_KEY_MAP[provider];
  return (envName && process.env[envName]) || null;
}

export async function providerHasKey(provider: ProviderKey): Promise<boolean> {
  return !!(await getApiKey(provider));
}

// ────────────────────────────────────────────────────────────────
// Provider adapters — normalized to { content, tokensIn, tokensOut }
// ────────────────────────────────────────────────────────────────
type NormalizedResponse = { content: string; tokensIn?: number; tokensOut?: number };

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders: Record<string, string> = {},
  opts?: GatewayOptions,
): Promise<NormalizedResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw wrapHttpError(res.status, text);
  }
  const json: any = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Provider returned empty content");
  return {
    content,
    tokensIn: json.usage?.prompt_tokens,
    tokensOut: json.usage?.completion_tokens,
  };
}

async function callGemini(apiKey: string, model: string, messages: ChatMessage[], opts?: GatewayOptions): Promise<NormalizedResponse> {
  // Convert to Gemini format: system → systemInstruction, others → contents[]
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { role: "user", parts: [{ text: system }] } } : {}),
      ...(opts?.temperature != null || opts?.maxTokens
        ? { generationConfig: {
            ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
            ...(opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
          } }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw wrapHttpError(res.status, text);
  }
  const json: any = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  if (!content) throw new Error("Gemini returned empty content");
  return {
    content,
    tokensIn: json.usageMetadata?.promptTokenCount,
    tokensOut: json.usageMetadata?.candidatesTokenCount,
  };
}

async function callAnthropic(apiKey: string, model: string, messages: ChatMessage[], opts?: GatewayOptions): Promise<NormalizedResponse> {
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const chat = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts?.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages: chat,
      ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw wrapHttpError(res.status, text);
  }
  const json: any = await res.json();
  const content = (json.content ?? []).map((b: any) => b.text ?? "").join("");
  if (!content) throw new Error("Anthropic returned empty content");
  return {
    content,
    tokensIn: json.usage?.input_tokens,
    tokensOut: json.usage?.output_tokens,
  };
}

async function runProvider(provider: ProviderKey, apiKey: string, model: string, messages: ChatMessage[], opts?: GatewayOptions): Promise<NormalizedResponse> {
  switch (provider) {
    case "lovable":
      return callOpenAiCompatible("https://ai.gateway.lovable.dev/v1/chat/completions", apiKey, model, messages, {}, opts);
    case "groq":
      return callOpenAiCompatible("https://api.groq.com/openai/v1/chat/completions", apiKey, model, messages, {}, opts);
    case "openrouter":
      return callOpenAiCompatible("https://openrouter.ai/api/v1/chat/completions", apiKey, model, messages, {
        "HTTP-Referer": "https://learnchiefai.lovable.app",
        "X-Title": "Learn Chief",
      }, opts);
    case "openai":
      return callOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, model, messages, {}, opts);
    case "mistral":
      return callOpenAiCompatible("https://api.mistral.ai/v1/chat/completions", apiKey, model, messages, {}, opts);
    case "gemini":
      return callGemini(apiKey, model, messages, opts);
    case "anthropic":
      return callAnthropic(apiKey, model, messages, opts);
  }
}

// ────────────────────────────────────────────────────────────────
// Error helpers
// ────────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function wrapHttpError(status: number, body: string): HttpError {
  const snippet = body.slice(0, 300);
  return new HttpError(status, `HTTP ${status}: ${snippet || "no body"}`);
}
function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 429 || err.status === 408 || (err.status >= 500 && err.status < 600);
  }
  // Network / fetch failures
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("fetch failed") || msg.includes("timeout") || msg.includes("network") || msg.includes("econn");
}
function isFailoverable(err: unknown): boolean {
  // Anything upstream that isn't a hard client-side auth problem worth stopping on.
  if (err instanceof HttpError) {
    // 401/403 → bad key: still fail over to next provider.
    // 400 → bad request specific to that provider (unsupported model, etc.): fail over.
    return true;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────
// Cache
// ────────────────────────────────────────────────────────────────
function hashPrompt(messages: ChatMessage[], operation?: string): string {
  const h = createHash("sha256");
  h.update(operation ?? "");
  h.update("\u0001");
  for (const m of messages) { h.update(m.role); h.update("\u0002"); h.update(m.content); h.update("\u0003"); }
  return h.digest("hex");
}

async function cacheGet(hash: string): Promise<{ response: string; provider: string; model: string; tokensIn?: number; tokensOut?: number } | null> {
  const { data } = await supabaseAdmin
    .from("ai_cache")
    .select("response, provider, model, tokens_in, tokens_out")
    .eq("prompt_hash", hash)
    .maybeSingle();
  if (!data) return null;
  await supabaseAdmin.from("ai_cache")
    .update({ hits: (data as any).hits != null ? undefined : undefined, last_hit_at: new Date().toISOString() })
    .eq("prompt_hash", hash);
  // Atomically bump hits
  await supabaseAdmin.rpc("noop_bump_ai_cache_hit" as any, { _hash: hash }).then(() => {}, () => {});
  return {
    response: data.response,
    provider: data.provider ?? "cache",
    model: data.model ?? "",
    tokensIn: (data as any).tokens_in ?? undefined,
    tokensOut: (data as any).tokens_out ?? undefined,
  };
}

async function cachePut(hash: string, response: string, provider: string, model: string, tokensIn?: number, tokensOut?: number) {
  await supabaseAdmin.from("ai_cache").upsert({
    prompt_hash: hash,
    response,
    provider,
    model,
    tokens_in: tokensIn ?? null,
    tokens_out: tokensOut ?? null,
  }, { onConflict: "prompt_hash" });
}

// ────────────────────────────────────────────────────────────────
// Logging
// ────────────────────────────────────────────────────────────────
async function logRequest(row: {
  provider: string; model?: string | null; operation?: string | null;
  status: "success" | "error" | "cached"; duration_ms?: number;
  tokens_in?: number | null; tokens_out?: number | null; cached?: boolean;
  error?: string | null; user_id?: string | null;
}) {
  try {
    await supabaseAdmin.from("ai_request_logs").insert({
      provider: row.provider,
      model: row.model ?? null,
      operation: row.operation ?? null,
      status: row.status,
      duration_ms: row.duration_ms ?? null,
      tokens_in: row.tokens_in ?? null,
      tokens_out: row.tokens_out ?? null,
      cached: !!row.cached,
      error: row.error ?? null,
      user_id: row.user_id ?? null,
    });
  } catch { /* logging must never break requests */ }
}

// ────────────────────────────────────────────────────────────────
// Provider chain
// ────────────────────────────────────────────────────────────────
export async function getEnabledProviderChain(): Promise<Array<{ provider: ProviderKey; model: string }>> {
  const { data } = await supabaseAdmin
    .from("ai_provider_configs")
    .select("provider_key, enabled, priority, model")
    .order("priority", { ascending: true });
  const chain: Array<{ provider: ProviderKey; model: string }> = [];
  for (const row of data ?? []) {
    if (!row.enabled) continue;
    const key = row.provider_key as ProviderKey;
    if (!ALL_PROVIDER_KEYS.includes(key)) continue;
    if (!(await providerHasKey(key))) continue;
    chain.push({ provider: key, model: row.model || DEFAULT_MODEL[key] });
  }
  return chain;
}

// ────────────────────────────────────────────────────────────────
// Public entrypoint
// ────────────────────────────────────────────────────────────────
export async function aiChat(messages: ChatMessage[], opts: GatewayOptions = {}): Promise<GatewayResult> {
  const useCache = opts.cache !== false;
  const hash = hashPrompt(messages, opts.operation);

  if (useCache) {
    const hit = await cacheGet(hash);
    if (hit) {
      await logRequest({
        provider: hit.provider, model: hit.model, operation: opts.operation,
        status: "cached", duration_ms: 0, cached: true,
        tokens_in: hit.tokensIn, tokens_out: hit.tokensOut, user_id: opts.userId ?? null,
      });
      return {
        content: hit.response, provider: hit.provider, model: hit.model,
        tokensIn: hit.tokensIn, tokensOut: hit.tokensOut, cached: true,
        attempts: [{ provider: hit.provider, durationMs: 0 }],
      };
    }
  }

  // Build the ordered candidate chain
  let chain: Array<{ provider: ProviderKey; model: string }>;
  if (opts.forceProvider) {
    const key = opts.forceProvider as ProviderKey;
    const model = opts.forceModel || DEFAULT_MODEL[key];
    chain = [{ provider: key, model }];
  } else {
    chain = await getEnabledProviderChain();
  }
  if (chain.length === 0) {
    throw new Error("No AI providers are configured. Please add at least one API key in Admin → AI Providers.");
  }

  const attempts: GatewayResult["attempts"] = [];
  let lastError: Error | null = null;

  for (const { provider, model } of chain) {
    const apiKey = await getApiKey(provider);
    if (!apiKey) continue;

    // Up to 2 tries per provider before failing over.
    for (let tryNum = 1; tryNum <= 2; tryNum++) {
      const started = Date.now();
      try {
        const result = await runProvider(provider, apiKey, model, messages, opts);
        const dur = Date.now() - started;
        attempts.push({ provider, durationMs: dur });
        await logRequest({
          provider, model, operation: opts.operation, status: "success",
          duration_ms: dur, tokens_in: result.tokensIn, tokens_out: result.tokensOut,
          user_id: opts.userId ?? null,
        });
        if (useCache) await cachePut(hash, result.content, provider, model, result.tokensIn, result.tokensOut);
        return { ...result, provider, model, cached: false, attempts };
      } catch (err) {
        const dur = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        lastError = err instanceof Error ? err : new Error(message);
        attempts.push({ provider, error: message, durationMs: dur });
        await logRequest({
          provider, model, operation: opts.operation, status: "error",
          duration_ms: dur, error: message, user_id: opts.userId ?? null,
        });
        if (tryNum === 1 && isRetryable(err)) {
          await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
          continue;
        }
        if (!isFailoverable(err)) throw err;
        break; // failover to next provider
      }
    }
  }

  throw new Error(
    `All configured AI providers are currently unavailable. Please try again in a moment. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

// Used by admin "Test Connection". Bypasses cache; forces a specific provider.
export async function testProviderConnection(provider: ProviderKey): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const apiKey = await getApiKey(provider);
  if (!apiKey) return { ok: false, latencyMs: 0, error: "No API key configured for this provider." };
  const started = Date.now();
  try {
    // Look up configured model, fall back to default
    const { data } = await supabaseAdmin
      .from("ai_provider_configs").select("model").eq("provider_key", provider).maybeSingle();
    const model = data?.model || DEFAULT_MODEL[provider];
    const res = await runProvider(provider, apiKey, model, [
      { role: "user", content: "Reply with the single word: pong" },
    ], { maxTokens: 8, temperature: 0 });
    const latencyMs = Date.now() - started;
    await logRequest({
      provider, model, operation: "connection-test", status: "success",
      duration_ms: latencyMs, tokens_in: res.tokensIn, tokens_out: res.tokensOut,
    });
    return { ok: !!res.content, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const error = err instanceof Error ? err.message : String(err);
    await logRequest({ provider, operation: "connection-test", status: "error", duration_ms: latencyMs, error });
    return { ok: false, latencyMs, error };
  }
}
