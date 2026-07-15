import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useRoles, useProfile, primaryRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import {
  BookOpen, Bot, Flame, Trophy, Users, GraduationCap, Shield,
  PlusCircle, TrendingUp, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardRouter,
});

function DashboardRouter() {
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const { data: profile } = useProfile(user?.id);
  const role = primaryRole(roles);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Welcome back, {profile?.full_name?.split(" ")[0] ?? "learner"} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground capitalize">
          {role} dashboard
        </p>
      </div>
      {role === "admin" && <AdminDashboard />}
      {role === "teacher" && <TeacherDashboard />}
      {role === "student" && <StudentDashboard />}
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, tint = "bg-primary/10 text-primary" }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function StudentDashboard() {
  const { data: user } = useSession();
  const { data: enrollments } = useQuery({
    queryKey: ["enrollments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("id, course_id, courses(id, title, slug, cover_url, description, subject_id, subjects(name))")
        .eq("user_id", user!.id)
        .limit(6);
      return data ?? [];
    },
  });
  const { data: recCourses } = useQuery({
    queryKey: ["recommended-courses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, title, slug, description, cover_url, subjects(name)")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });
  const { data: progressCount } = useQuery({
    queryKey: ["progress-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("lesson_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("completed", true);
      return count ?? 0;
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="Enrolled courses" value={enrollments?.length ?? 0} />
        <StatCard icon={Trophy} label="Lessons completed" value={progressCount ?? 0} tint="bg-accent/20 text-primary" />
        <StatCard icon={Flame} label="Study streak" value="0 days" tint="bg-primary-glow/20 text-primary" />
        <StatCard icon={Bot} label="AI Assistant" value="Ready" tint="bg-primary/10 text-primary" />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Continue Learning</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/courses">Browse all <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
        </div>
        {enrollments && enrollments.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments.map((e: any) => (
              <Link key={e.id} to="/courses/$courseId" params={{ courseId: e.courses.id }} className="group rounded-xl border bg-gradient-card p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-elegant">
                <div className="text-xs text-primary">{e.courses.subjects?.name ?? "Course"}</div>
                <div className="mt-1 font-semibold">{e.courses.title}</div>
                <Progress value={30} className="mt-3 h-1.5" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Start your learning journey"
            desc="You haven't enrolled in any courses yet."
            cta={<Button asChild><Link to="/courses">Browse courses</Link></Button>}
          />
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recommended for you</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/courses">See all</Link></Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(recCourses ?? []).map((c: any) => (
            <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="group rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-elegant">
              <div className="text-xs uppercase tracking-wider text-primary">{c.subjects?.name}</div>
              <div className="mt-2 font-semibold">{c.title}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</div>
            </Link>
          ))}
          {(!recCourses || recCourses.length === 0) && (
            <div className="col-span-full text-sm text-muted-foreground">No published courses yet — check back soon.</div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-gradient-hero p-6 text-white shadow-elegant">
          <Bot className="h-8 w-8" />
          <h3 className="mt-3 text-xl font-bold">Ask your AI Study Assistant</h3>
          <p className="mt-1 text-sm text-white/70">Solve maths, explain concepts, generate quizzes, and more.</p>
          <Button asChild className="mt-4 bg-white text-brand hover:bg-white/90"><Link to="/assistant">Start chatting</Link></Button>
        </Card>
        <Card className="p-6">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h3 className="mt-3 text-xl font-bold">Weekly goal</h3>
          <p className="mt-1 text-sm text-muted-foreground">Complete 5 lessons this week</p>
          <Progress value={(progressCount ?? 0) * 20} className="mt-4 h-2" />
        </Card>
      </div>
    </div>
  );
}

function TeacherDashboard() {
  const { data: user } = useSession();
  const { data: courses } = useQuery({
    queryKey: ["my-courses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, title, is_published, subjects(name)")
        .eq("teacher_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={BookOpen} label="My courses" value={courses?.length ?? 0} />
        <StatCard icon={Users} label="Learners" value="—" tint="bg-accent/20 text-primary" />
        <StatCard icon={Trophy} label="Published" value={courses?.filter((c) => c.is_published).length ?? 0} tint="bg-primary-glow/20 text-primary" />
      </div>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your courses</h2>
          <Button asChild size="sm"><Link to="/teacher"><PlusCircle className="mr-1 h-4 w-4" /> Manage</Link></Button>
        </div>
        {courses && courses.length > 0 ? (
          <div className="divide-y">
            {courses.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.subjects?.name}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.is_published ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                  {c.is_published ? "Published" : "Draft"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No courses yet" desc="Create your first course to get started." cta={<Button asChild><Link to="/teacher">Create course</Link></Button>} />
        )}
      </Card>
    </div>
  );
}

function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, teachers, courses, subjects] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("courses").select("*", { count: "exact", head: true }),
        supabase.from("subjects").select("*", { count: "exact", head: true }),
      ]);
      return {
        users: users.count ?? 0,
        teachers: teachers.count ?? 0,
        courses: courses.count ?? 0,
        subjects: subjects.count ?? 0,
      };
    },
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total users" value={stats?.users ?? 0} />
        <StatCard icon={GraduationCap} label="Teachers" value={stats?.teachers ?? 0} tint="bg-accent/20 text-primary" />
        <StatCard icon={BookOpen} label="Courses" value={stats?.courses ?? 0} tint="bg-primary-glow/20 text-primary" />
        <StatCard icon={Shield} label="Subjects" value={stats?.subjects ?? 0} tint="bg-primary/10 text-primary" />
      </div>
      <Card className="p-6">
        <h2 className="mb-2 text-lg font-semibold">Platform management</h2>
        <p className="text-sm text-muted-foreground">Head to the admin console to manage users, subjects, courses and announcements.</p>
        <Button asChild className="mt-4"><Link to="/admin">Open admin console</Link></Button>
      </Card>
    </div>
  );
}

function EmptyState({ title, desc, cta }: { title: string; desc: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      <BookOpen className="h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
