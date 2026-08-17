import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { issueWarning, resolveWarning, revokeWarning, setAccountStatus } from "@/lib/admin-users.functions";
import { formatDateTime, timeAgo } from "@/lib/activity";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Users, Wifi, ShieldCheck, ShieldOff, Bot, AlertTriangle, Search, RotateCcw, Ban, CheckCircle2, ChevronLeft, ChevronRight,
} from "lucide-react";

type Row = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  account_status: string;
  login_count: number;
  last_login_at: string | null;
  last_logout_at: string | null;
  last_seen_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  ai_count: number;
  ai_last_at: string | null;
  ai_errors: number;
  ai_today: number;
  warnings_active: number;
  warnings_total: number;
  online: boolean;
};

type Page = { total: number; rows: Row[]; limit: number; offset: number };

const PAGE_SIZE = 25;
const ANY = "any";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return <Badge variant="outline" className={`capitalize ${map[status] ?? ""}`}>{status}</Badge>;
}

function Presence({ online, lastSeen }: { online: boolean; lastSeen: string | null }) {
  return (
    <span className="whitespace-nowrap text-xs">
      {online ? (
        <span className="font-medium text-emerald-600">🟢 Online</span>
      ) : (
        <span className="text-muted-foreground">⚪ Offline · {timeAgo(lastSeen)}</span>
      )}
    </span>
  );
}

function SummaryCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_summary");
      if (error) throw error;
      return data as Record<string, number>;
    },
    refetchInterval: 60_000,
  });

  const cards = [
    { label: "Total users", value: data?.total_users, icon: Users },
    { label: "Online now", value: data?.online_now, icon: Wifi },
    { label: "Active accounts", value: data?.active_accounts, icon: ShieldCheck },
    { label: "Inactive / suspended", value: (data?.inactive_accounts ?? 0) + (data?.suspended_accounts ?? 0), icon: ShieldOff },
    { label: "AI users today", value: data?.ai_users_today, icon: Bot },
    { label: "Active warnings", value: data?.active_warnings, icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <c.icon className="h-4 w-4" /> {c.label}
          </div>
          <div className="mt-2 text-2xl font-bold">
            {isLoading ? <Skeleton className="h-7 w-10" /> : (c.value ?? 0)}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AdminUserManagement() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [presence, setPresence] = useState(ANY);
  const [ai, setAi] = useState(ANY);
  const [warned, setWarned] = useState(ANY);
  const [sort, setSort] = useState("last_activity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { search, role, status, presence, ai, warned, sort, dir, page };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-users", filters],
    queryFn: async (): Promise<Page> => {
      const { data, error } = await supabase.rpc("admin_users_page", {
        _q: search || undefined,
        _role: role === ANY ? undefined : role,
        _status: status === ANY ? undefined : status,
        _presence: presence === ANY ? undefined : presence,
        _ai: ai === ANY ? undefined : ai,
        _warned: warned === ANY ? undefined : warned === "yes",
        _sort: sort,
        _dir: dir,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as Page;
    },
    refetchInterval: 60_000,
  });

  // A single realtime channel keeps presence, warnings and status fresh.
  useEffect(() => {
    const channel = supabase
      .channel("admin-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_warnings" }, () => {
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-summary"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, () => {
        void qc.invalidateQueries({ queryKey: ["admin-summary"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetFilters() {
    setQ(""); setRole(ANY); setStatus(ANY); setPresence(ANY); setAi(ANY); setWarned(ANY);
    setSort("last_activity"); setDir("desc"); setPage(0);
  }

  return (
    <div className="space-y-4">
      <SummaryCards />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <FilterSelect label="Role" value={role} onChange={(v) => { setRole(v); setPage(0); }}
            options={[["any", "Any role"], ["student", "Student"], ["teacher", "Teacher"], ["admin", "Admin"]]} />
          <FilterSelect label="Account" value={status} onChange={(v) => { setStatus(v); setPage(0); }}
            options={[["any", "Any status"], ["active", "Active"], ["inactive", "Inactive"], ["suspended", "Suspended"]]} />
          <FilterSelect label="Presence" value={presence} onChange={(v) => { setPresence(v); setPage(0); }}
            options={[["any", "Any presence"], ["online", "Online"], ["offline", "Offline"]]} />
          <FilterSelect label="AI used" value={ai} onChange={(v) => { setAi(v); setPage(0); }}
            options={[["any", "Any"], ["yes", "Yes"], ["no", "No"]]} />
          <FilterSelect label="Warnings" value={warned} onChange={(v) => { setWarned(v); setPage(0); }}
            options={[["any", "Any"], ["yes", "With active"], ["no", "None active"]]} />
          <FilterSelect label="Sort by" value={sort} onChange={(v) => { setSort(v); setPage(0); }}
            options={[["last_activity", "Last activity"], ["last_login", "Last login"], ["ai", "AI usage"], ["warnings", "Warnings"], ["created", "Joined"]]} />
          <Button variant="outline" size="sm" onClick={() => setDir(dir === "desc" ? "asc" : "desc")}>
            {dir === "desc" ? "Desc" : "Asc"}
          </Button>
          <Button variant="ghost" size="sm" onClick={resetFilters}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
        </div>
      </Card>

      <Card className="p-0">
        {isError && (
          <div className="p-6 text-sm text-destructive">
            {(error as Error)?.message?.includes("Forbidden") ? "Access denied." : "Could not load users. Please try again."}
          </div>
        )}
        {!isError && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">Presence</th>
                  <th className="p-3">Last login</th>
                  <th className="p-3">Last logout</th>
                  <th className="p-3">AI</th>
                  <th className="p-3">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b"><td className="p-3" colSpan={8}><Skeleton className="h-5 w-full" /></td></tr>
                  ))}
                {!isLoading && rows.length === 0 && (
                  <tr><td className="p-10 text-center text-muted-foreground" colSpan={8}>No users match these filters.</td></tr>
                )}
                {rows.map((u) => (
                  <tr key={u.id} className="cursor-pointer border-b hover:bg-accent/30" onClick={() => setSelected(u.id)}>
                    <td className="p-3">
                      <div className="font-medium">{u.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="p-3 capitalize">{u.role}</td>
                    <td className="p-3"><StatusBadge status={u.account_status} /></td>
                    <td className="p-3"><Presence online={u.online} lastSeen={u.last_seen_at ?? u.last_activity_at} /></td>
                    <td className="p-3 text-xs">{formatDateTime(u.last_login_at)}<div className="text-muted-foreground">{u.login_count} logins</div></td>
                    <td className="p-3 text-xs">{formatDateTime(u.last_logout_at)}</td>
                    <td className="p-3 text-xs">
                      {u.ai_count > 0 ? <>Yes · {u.ai_count}<div className="text-muted-foreground">{timeAgo(u.ai_last_at)}</div></> : <span className="text-muted-foreground">No</span>}
                    </td>
                    <td className="p-3">
                      {u.warnings_active > 0
                        ? <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">{u.warnings_active} active</Badge>
                        : <span className="text-xs text-muted-foreground">{u.warnings_total > 0 ? `${u.warnings_total} historic` : "0"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <div>{total} user{total === 1 ? "" : "s"}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page + 1} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <UserDetailSheet userId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

type Detail = {
  user: Row | null;
  activity: Array<{ event_type: string; occurred_at: string; subject: string | null; topic: string | null }>;
  sessions: Array<{ id: string; started_at: string; ended_at: string | null; end_reason: string | null; last_seen_at: string; platform: string | null }>;
  warnings: Array<{
    id: string; category: string; severity: string; reason: string; message: string | null;
    issued_at: string; expires_at: string | null; acknowledged_at: string | null;
    resolved_at: string | null; resolution_note: string | null; revoked_at: string | null;
    revocation_note: string | null; issued_by_name: string | null;
  }>;
  ai: { total: number; today: number; week: number; errors: number };
};

function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [warnOpen, setWarnOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { status: "suspended" | "active" | "inactive" }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-detail", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Detail> => {
      const { data, error } = await supabase.rpc("admin_user_detail", { _user_id: userId! });
      if (error) throw error;
      return data as unknown as Detail;
    },
  });

  const statusFn = useServerFn(setAccountStatus);
  const resolveFn = useServerFn(resolveWarning);
  const revokeFn = useServerFn(revokeWarning);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-summary"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: "suspended" | "active" | "inactive") => statusFn({ data: { userId: userId!, status } }),
    onSuccess: () => { toast.success("Account status updated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMutation = useMutation({
    mutationFn: (warningId: string) => resolveFn({ data: { warningId } }),
    onSuccess: () => { toast.success("Warning resolved"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (warningId: string) => revokeFn({ data: { warningId } }),
    onSuccess: () => { toast.success("Warning revoked"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const u = data?.user ?? null;

  return (
    <Sheet open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>User management</SheetTitle></SheetHeader>

        {isLoading && <div className="mt-6 space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-24 w-full" /></div>}

        {!isLoading && !u && <p className="mt-6 text-sm text-muted-foreground">This user could not be loaded.</p>}

        {u && (
          <div className="mt-6 space-y-6 pb-10">
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Account</h3>
              <div className="mt-2 space-y-1 text-sm">
                <div className="text-base font-semibold">{u.full_name ?? "—"}</div>
                <div className="text-muted-foreground">{u.email}</div>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                  <StatusBadge status={u.account_status} />
                  <Presence online={u.online} lastSeen={u.last_seen_at ?? u.last_activity_at} />
                </div>
                <div className="pt-1 text-xs text-muted-foreground">Registered {formatDateTime(u.created_at)}</div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Activity</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <Field label="Last login" value={formatDateTime(u.last_login_at)} />
                <Field label="Last logout" value={u.last_logout_at ? formatDateTime(u.last_logout_at) : "No explicit sign-out recorded"} />
                <Field label="Login count" value={String(u.login_count)} />
                <Field label="Last activity" value={u.last_activity_at ? timeAgo(u.last_activity_at) : "—"} />
              </dl>
              <ul className="mt-3 space-y-1 text-xs">
                {(data?.activity ?? []).length === 0 && <li className="text-muted-foreground">No activity recorded yet.</li>}
                {(data?.activity ?? []).map((a, i) => (
                  <li key={i} className="flex justify-between rounded-md bg-muted/40 px-2 py-1">
                    <span className="capitalize">{a.event_type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{formatDateTime(a.occurred_at)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">AI usage</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <Field label="AI used" value={u.ai_count > 0 ? "Yes" : "No"} />
                <Field label="Total interactions" value={String(data?.ai.total ?? 0)} />
                <Field label="Last interaction" value={formatDateTime(u.ai_last_at)} />
                <Field label="Errors" value={String(data?.ai.errors ?? 0)} />
                <Field label="Today" value={String(data?.ai.today ?? 0)} />
                <Field label="This week" value={String(data?.ai.week ?? 0)} />
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                Conversation content is private and is never exposed here.
              </p>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Warnings</h3>
                <Button size="sm" onClick={() => setWarnOpen(true)}><AlertTriangle className="mr-2 h-4 w-4" /> Issue warning</Button>
              </div>
              <div className="mt-3 space-y-2">
                {(data?.warnings ?? []).length === 0 && <p className="text-xs text-muted-foreground">No warnings on record.</p>}
                {(data?.warnings ?? []).map((w) => {
                  const state = w.revoked_at ? "Revoked" : w.resolved_at ? "Resolved" : "Active";
                  return (
                    <div key={w.id} className="rounded-lg border p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="uppercase">{w.severity}</Badge>
                        <span className="font-medium">{w.category}</span>
                        <Badge variant={state === "Active" ? "destructive" : "secondary"}>{state}</Badge>
                      </div>
                      <p className="mt-2">{w.reason}</p>
                      {w.message && <p className="mt-1 text-muted-foreground">{w.message}</p>}
                      <div className="mt-2 space-y-0.5 text-muted-foreground">
                        <div>Issued {formatDateTime(w.issued_at)} by {w.issued_by_name ?? "administrator"}</div>
                        {w.expires_at && <div>Expires {formatDateTime(w.expires_at)}</div>}
                        <div>{w.acknowledged_at ? `Acknowledged ${formatDateTime(w.acknowledged_at)}` : "Not acknowledged yet"}</div>
                        {w.resolved_at && <div>Resolved {formatDateTime(w.resolved_at)}</div>}
                        {w.revoked_at && <div>Revoked {formatDateTime(w.revoked_at)}</div>}
                      </div>
                      {state === "Active" && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" disabled={resolveMutation.isPending} onClick={() => resolveMutation.mutate(w.id)}>
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
                          </Button>
                          <Button size="sm" variant="ghost" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(w.id)}>
                            Revoke
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Admin actions</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {u.account_status !== "suspended" ? (
                  <Button variant="destructive" size="sm" onClick={() => setConfirm({ status: "suspended" })}>
                    <Ban className="mr-2 h-4 w-4" /> Suspend account
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setConfirm({ status: "active" })}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Reactivate account
                  </Button>
                )}
                {u.account_status === "active" && (
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ status: "inactive" })}>Mark inactive</Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Passwords and authentication credentials are never accessible from this console.
              </p>
            </section>
          </div>
        )}

        <IssueWarningDialog open={warnOpen} onOpenChange={setWarnOpen} userId={userId} onDone={refresh} />

        <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.status === "suspended" ? "Suspend this account?" : confirm?.status === "active" ? "Reactivate this account?" : "Mark this account inactive?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.status === "suspended"
                  ? "The learner will be blocked from signing in until an administrator reactivates the account."
                  : "This change is recorded in the administrative audit log."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (confirm) statusMutation.mutate(confirm.status); setConfirm(null); }}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

const CATEGORIES = ["Conduct", "Academic honesty", "Platform misuse", "Inappropriate content", "Attendance", "Other"];

function IssueWarningDialog({
  open, onOpenChange, userId, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; onDone: () => void }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("low");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState("");
  const issueFn = useServerFn(issueWarning);

  const mutation = useMutation({
    mutationFn: () =>
      issueFn({
        data: {
          userId: userId!,
          category,
          severity,
          reason: reason.trim(),
          message: message.trim() || undefined,
          expiresAt: expires ? new Date(expires).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Warning issued");
      setReason(""); setMessage(""); setExpires(""); setSeverity("low");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = useMemo(() => reason.trim().length >= 3, [reason]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Issue an administrative warning</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as "low" | "medium" | "high")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — informational</SelectItem>
                <SelectItem value="medium">Medium — formal warning</SelectItem>
                <SelectItem value="high">High — may lead to suspension</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="warn-reason">Reason</Label>
            <Input id="warn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short summary shown to the learner" />
          </div>
          <div>
            <Label htmlFor="warn-message">Message (optional)</Label>
            <Textarea id="warn-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="warn-expiry">Expires (optional)</Label>
            <Input id="warn-expiry" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Issuing…" : "Issue warning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
