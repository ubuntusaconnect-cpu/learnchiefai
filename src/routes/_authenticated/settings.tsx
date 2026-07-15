import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useProfile } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", school: "", grade: "", bio: "" });
  useEffect(() => { if (profile) setF({ full_name: profile.full_name ?? "", school: profile.school ?? "", grade: profile.grade ?? "", bio: profile.bio ?? "" }); }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update(f).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell>
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>
      <Card className="max-w-xl p-6">
        <h2 className="font-semibold">Your profile</h2>
        <div className="mt-4 space-y-3">
          <div><Label>Full name</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div><Label>School</Label><Input value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} /></div>
          <div><Label>Grade</Label><Input value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} placeholder="e.g. Grade 11" /></div>
          <div><Label>Bio</Label><Textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
        </div>
        <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">Email: {user?.email}</div>
      </Card>
    </AppShell>
  );
}
