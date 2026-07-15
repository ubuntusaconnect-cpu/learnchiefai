import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Bookmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bookmarks")({
  component: BookmarksPage,
});

function BookmarksPage() {
  const { data: user } = useSession();
  const { data } = useQuery({
    queryKey: ["bookmarks-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("bookmarks").select("id, lessons(id, title, modules(title, courses(title)))").eq("user_id", user!.id);
      return data ?? [];
    },
  });
  return (
    <AppShell>
      <h1 className="mb-6 text-3xl font-bold flex items-center gap-2"><Bookmark className="h-6 w-6" /> Bookmarks</h1>
      {!data || data.length === 0 ? (
        <Card className="border-dashed p-12 text-center text-sm text-muted-foreground">You haven't bookmarked any lessons yet.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((b: any) => (
            <Link key={b.id} to="/lessons/$lessonId" params={{ lessonId: b.lessons.id }}>
              <Card className="p-4 transition hover:shadow-card">
                <div className="text-xs text-primary">{b.lessons.modules?.courses?.title}</div>
                <div className="font-semibold">{b.lessons.title}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
