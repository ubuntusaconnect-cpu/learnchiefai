import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useRoles, primaryRole } from "@/lib/roles";
import {
  listAiProviders, upsertAiProvider, deleteAiProviderKey, reorderAiProviders,
  testAiProvider, getAiStats, listAiLogs,
} from "@/lib/ai-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ShieldAlert, CheckCircle2, XCircle, Eye, EyeOff, RefreshCw, Trash2,
  ArrowUp, ArrowDown, Zap, Activity, BarChart3, ScrollText, Save, TestTube2, KeyRound,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai-providers")({
  component: AiProvidersPage,
});

function AiProvidersPage() {
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  if (primaryRole(roles) !== "admin") {
    return (
      <AppShell>
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">Admins only</h1>
        </Card>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Zap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">AI Providers</h1>
          <p className="text-sm text-muted-foreground">Manage keys, priority, and failover for every AI provider.</p>
        </div>
      </div>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers"><KeyRound className="mr-2 h-4 w-4" /> Providers</TabsTrigger>
          <TabsTrigger value="health"><Activity className="mr-2 h-4 w-4" /> Health</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="mr-2 h-4 w-4" /> Analytics</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="mr-2 h-4 w-4" /> Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4"><ProvidersPanel /></TabsContent>
        <TabsContent value="health" className="mt-4"><HealthPanel /></TabsContent>
        <TabsContent value="analytics" className="mt-4"><AnalyticsPanel /></TabsContent>
        <TabsContent value="logs" className="mt-4"><LogsPanel /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────
function ProvidersPanel() {
  const listFn = useServerFn(listAiProviders);
  const upsertFn = useServerFn(upsertAiProvider);
  const deleteKeyFn = useServerFn(deleteAiProviderKey);
  const reorderFn = useServerFn(reorderAiProviders);
  const testFn = useServerFn(testAiProvider);
  const qc = useQueryClient();

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-providers"] });

  const move = useMutation({
    mutationFn: async (params: { key: string; dir: -1 | 1 }) => {
      type PK = "lovable" | "gemini" | "groq" | "openrouter" | "openai" | "anthropic" | "mistral";
      const order = providers.map((p) => p.providerKey as PK);
      const idx = order.indexOf(params.key as PK);
      const next = idx + params.dir;
      if (idx < 0 || next < 0 || next >= order.length) return;
      [order[idx], order[next]] = [order[next], order[idx]];
      await reorderFn({ data: { order } });
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed to reorder"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Providers are tried top-to-bottom. If one fails, rate-limits, or times out, the gateway automatically
          fails over to the next enabled provider with a valid key. The user never has to retry.
        </p>
      </Card>

      {isLoading && <Card className="h-32 animate-pulse" />}

      {providers.map((p, idx) => (
        <ProviderCard
          key={p.providerKey}
          provider={p}
          index={idx}
          total={providers.length}
          onSave={async (form) => {
            await upsertFn({ data: { providerKey: p.providerKey as any, ...form } });
            invalidate();
          }}
          onDeleteKey={async () => {
            if (!confirm(`Remove the stored API key for ${p.name}?`)) return;
            await deleteKeyFn({ data: { providerKey: p.providerKey as any } });
            invalidate();
          }}
          onTest={async () => {
            const res = await testFn({ data: { providerKey: p.providerKey as any } });
            if (res.ok) toast.success(`${p.name}: connection OK (${res.latencyMs} ms)`);
            else toast.error(`${p.name}: ${res.error ?? "connection failed"}`);
            invalidate();
          }}
          onMoveUp={() => move.mutate({ key: p.providerKey, dir: -1 })}
          onMoveDown={() => move.mutate({ key: p.providerKey, dir: 1 })}
        />
      ))}
    </div>
  );
}

type ProviderRow = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listAiProviders>>>>[number];

function ProviderCard({
  provider, index, total, onSave, onDeleteKey, onTest, onMoveUp, onMoveDown,
}: {
  provider: ProviderRow; index: number; total: number;
  onSave: (form: { enabled: boolean; model: string; apiKey?: string | null }) => Promise<void>;
  onDeleteKey: () => Promise<void>; onTest: () => Promise<void>;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [enabled, setEnabled] = useState(provider.enabled);
  const [model, setModel] = useState(provider.model ?? provider.defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { setEnabled(provider.enabled); setModel(provider.model ?? provider.defaultModel); }, [provider]);

  async function handleSave() {
    setBusy(true);
    try {
      await onSave({ enabled, model, apiKey: apiKey || undefined });
      setApiKey("");
      toast.success(`${provider.name} saved`);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setBusy(false); }
  }

  const badgeColour = provider.hasKey
    ? (provider.lastTestOk === false ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600")
    : "bg-muted text-muted-foreground";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
            {provider.name.slice(0, 1)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{provider.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${badgeColour}`}>
                {provider.hasKey ? (provider.lastTestOk === false ? "Test failed" : "Connected") : "Not configured"}
              </span>
              {provider.keySource === "env" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">env var</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Priority {index + 1} · env: <code>{provider.envVar}</code>
              {provider.lastTestAt && (
                <> · last test {new Date(provider.lastTestAt).toLocaleString()}
                  {provider.lastTestLatencyMs != null && ` (${provider.lastTestLatencyMs} ms)`}</>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={onMoveUp}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" disabled={index === total - 1} onClick={onMoveDown}><ArrowDown className="h-4 w-4" /></Button>
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span>{enabled ? "Enabled" : "Disabled"}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider.defaultModel} />
          <p className="mt-1 text-xs text-muted-foreground">Default: <code>{provider.defaultModel}</code></p>
        </div>
        <div>
          <Label className="text-xs">API key {provider.maskedKey && <span className="text-muted-foreground">— currently {provider.maskedKey}</span>}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={reveal ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider.hasKey ? "•••••••••••••• (leave blank to keep)" : `Paste ${provider.name} API key`}
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setReveal(!reveal)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {provider.keySource === "database" && (
              <Button variant="outline" size="icon" onClick={onDeleteKey} title="Delete stored key">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored server-side only. Get a key at <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="underline">{provider.docsUrl}</a>.
          </p>
        </div>
      </div>

      {provider.lastTestError && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Last test error: {provider.lastTestError}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={busy}>
          <Save className="mr-2 h-4 w-4" /> {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" disabled={testing || !provider.hasKey} onClick={async () => {
          setTesting(true); try { await onTest(); } finally { setTesting(false); }
        }}>
          <TestTube2 className="mr-2 h-4 w-4" /> {testing ? "Testing…" : "Test connection"}
        </Button>
        {provider.lastTestOk === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {provider.lastTestOk === false && <XCircle className="h-4 w-4 text-destructive" />}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
function HealthPanel() {
  const listFn = useServerFn(listAiProviders);
  const statsFn = useServerFn(getAiStats);
  const { data: providers = [] } = useQuery({ queryKey: ["ai-providers"], queryFn: () => listFn() });
  const { data: stats } = useQuery({ queryKey: ["ai-stats"], queryFn: () => statsFn() });

  const active = providers.find((p) => p.enabled && p.hasKey);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Active provider" value={active?.name ?? "None"} />
        <StatCard label="Configured" value={`${providers.filter((p) => p.hasKey).length} / ${providers.length}`} />
        <StatCard label="Requests today" value={String(stats?.requestsToday ?? 0)} />
        <StatCard label="Cache hits today" value={String(stats?.cacheHitsToday ?? 0)} />
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">Provider</th><th className="p-3">Status</th>
                <th className="p-3">Enabled</th><th className="p-3">Priority</th>
                <th className="p-3">Last test</th><th className="p-3">Latency</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={p.providerKey} className="border-b">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">
                    {p.hasKey ? (
                      p.lastTestOk === false
                        ? <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" /> Failing</span>
                        : <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</span>
                    ) : <span className="text-muted-foreground">Not configured</span>}
                  </td>
                  <td className="p-3">{p.enabled ? "Yes" : "No"}</td>
                  <td className="p-3">#{i + 1}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.lastTestAt ? new Date(p.lastTestAt).toLocaleString() : "—"}</td>
                  <td className="p-3 text-xs">{p.lastTestLatencyMs ? `${p.lastTestLatencyMs} ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
function AnalyticsPanel() {
  const statsFn = useServerFn(getAiStats);
  const { data: stats, refetch, isFetching } = useQuery({ queryKey: ["ai-stats"], queryFn: () => statsFn() });

  const providers = Object.entries(stats?.providerBreakdown ?? {})
    .sort(([, a], [, b]) => (b.success + b.error + b.cached) - (a.success + a.error + a.cached));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Requests today" value={String(stats?.requestsToday ?? 0)} />
        <StatCard label="Requests this month" value={String(stats?.requestsThisMonth ?? 0)} />
        <StatCard label="Tokens (in/out)" value={`${stats?.tokensThisMonth.in ?? 0} / ${stats?.tokensThisMonth.out ?? 0}`} />
        <StatCard label="Est. cost (USD)" value={`$${stats?.estCostUsdThisMonth ?? 0}`} />
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">Provider</th><th className="p-3">Success</th>
                <th className="p-3">Errors</th><th className="p-3">Cached</th>
                <th className="p-3">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(([name, s]) => (
                <tr key={name} className="border-b">
                  <td className="p-3 font-medium">{name}</td>
                  <td className="p-3 text-emerald-600">{s.success}</td>
                  <td className="p-3 text-destructive">{s.error}</td>
                  <td className="p-3">{s.cached}</td>
                  <td className="p-3">{s.count ? `${Math.round(s.totalDur / s.count)} ms` : "—"}</td>
                </tr>
              ))}
              {providers.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={5}>No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
function LogsPanel() {
  const logsFn = useServerFn(listAiLogs);
  const { data: logs = [], refetch, isFetching } = useQuery({
    queryKey: ["ai-logs"],
    queryFn: () => logsFn({ data: { limit: 200 } }),
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      <Card className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b bg-muted/80 text-left backdrop-blur">
              <tr>
                <th className="p-2">Time</th><th className="p-2">Provider</th>
                <th className="p-2">Op</th><th className="p-2">Status</th>
                <th className="p-2">Duration</th><th className="p-2">Tokens</th>
                <th className="p-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l: any) => (
                <tr key={l.id} className="border-b">
                  <td className="p-2 text-xs">{new Date(l.created_at).toLocaleTimeString()}</td>
                  <td className="p-2 font-medium">{l.provider}</td>
                  <td className="p-2 text-xs">{l.operation ?? "—"}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      l.status === "success" ? "bg-emerald-500/10 text-emerald-600"
                      : l.status === "cached" ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive"
                    }`}>{l.status}</span>
                  </td>
                  <td className="p-2 text-xs">{l.duration_ms ? `${l.duration_ms} ms` : "—"}</td>
                  <td className="p-2 text-xs">{(l.tokens_in ?? 0)} / {(l.tokens_out ?? 0)}</td>
                  <td className="p-2 max-w-[300px] truncate text-xs text-destructive" title={l.error ?? ""}>{l.error ?? ""}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={7}>No logs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
