import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/** Bell menu showing the signed-in learner their own administrative warnings. */
export function WarningNotifications({ userId }: { userId: string | undefined }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["my-warnings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_warnings")
        .select("id, category, severity, reason, message, issued_at, acknowledged_at, resolved_at, revoked_at")
        .order("issued_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 120_000,
  });

  const items = (data ?? []).filter((w) => !w.revoked_at);
  const unread = items.filter((w) => !w.acknowledged_at && !w.resolved_at);

  async function acknowledge(id: string) {
    const { error } = await supabase.rpc("acknowledge_warning", { _warning_id: id });
    if (error) return toast.error("Could not acknowledge this warning.");
    void qc.invalidateQueries({ queryKey: ["my-warnings", userId] });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-3 text-sm font-semibold">Notifications</div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">You have no notifications.</p>}
          {items.map((w) => (
            <div key={w.id} className="border-b p-3 text-xs last:border-0">
              <div className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Account Warning
                <Badge variant="outline" className="uppercase">{w.severity}</Badge>
              </div>
              <p className="mt-1"><span className="text-muted-foreground">Reason: </span>{w.reason}</p>
              {w.message && <p className="mt-1 text-muted-foreground">{w.message}</p>}
              <p className="mt-1 text-muted-foreground">Issued {formatDateTime(w.issued_at)}</p>
              {w.resolved_at ? (
                <p className="mt-1 text-emerald-600">Resolved</p>
              ) : w.acknowledged_at ? (
                <p className="mt-1 text-muted-foreground">Acknowledged</p>
              ) : (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => acknowledge(w.id)}>
                  Acknowledge warning
                </Button>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
