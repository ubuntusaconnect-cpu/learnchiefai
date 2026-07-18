import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles, useProfile, primaryRole, type AppRole } from "@/lib/roles";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, BookOpen, Bot, Search, GraduationCap, Settings,
  Shield, Bell, LogOut, Menu, X, Bookmark, FileText,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function navFor(role: AppRole) {
  const base = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/courses", label: "Courses", icon: BookOpen },
    { to: "/papers", label: "Question Papers", icon: FileText },
    { to: "/assistant", label: "AI Assistant", icon: Bot },
    { to: "/search", label: "Search", icon: Search },
    { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  ];
  if (role === "teacher") base.push({ to: "/teacher", label: "Teach", icon: GraduationCap });
  if (role === "admin") {
    base.push({ to: "/teacher", label: "Teach", icon: GraduationCap });
    base.push({ to: "/admin", label: "Admin", icon: Shield });
  }
  base.push({ to: "/settings", label: "Settings", icon: Settings });
  return base;
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const { data: profile } = useProfile(user?.id);
  const role = primaryRole(roles);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const items = navFor(role);
  const [query, setQuery] = useState("");

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    navigate({ to: "/search", search: { q: query.trim() } });
  }

  const initials = (profile?.full_name ?? user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-surface">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-card md:flex md:flex-col">
        <div className="p-5"><Logo /></div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((it) => {
            const active = path === it.to || (it.to !== "/dashboard" && path.startsWith(it.to));
            return (
              <Link
                key={it.to}
                to={it.to as any}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
              >
                <it.icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-2 rounded-lg p-2">
            <Avatar className="h-9 w-9"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{profile?.full_name ?? user?.email}</div>
              <div className="text-xs capitalize text-muted-foreground">{role}</div>
            </div>
            <button onClick={signOut} title="Sign out" className="rounded-md p-2 hover:bg-accent">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card/80 px-4 py-3 backdrop-blur">
          <button className="rounded-md p-2 hover:bg-accent md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <form onSubmit={submitSearch} className="relative flex-1 max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subjects, courses, lessons…" className="pl-9" />
          </form>
          <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
          <div className="md:hidden">
            <Avatar className="h-8 w-8"><AvatarFallback>{initials}</AvatarFallback></Avatar>
          </div>
        </header>

        {/* Mobile menu */}
        {open && (
          <div className="border-b bg-card md:hidden">
            <nav className="grid gap-1 p-3">
              {items.map((it) => (
                <Link key={it.to} to={it.to as any} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm">
                  <it.icon className="h-4 w-4" /> {it.label}
                </Link>
              ))}
              <button onClick={signOut} className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-destructive">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
