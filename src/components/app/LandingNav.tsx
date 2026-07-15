import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/roles";

const nav = [
  { label: "Home", to: "/" as const, hash: undefined },
  { label: "Features", to: "/" as const, hash: "features" },
  { label: "Subjects", to: "/" as const, hash: "subjects" },
  { label: "AI Assistant", to: "/" as const, hash: "ai" },
  { label: "FAQ", to: "/" as const, hash: "faq" },
  { label: "Contact", to: "/" as const, hash: "contact" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const { data: user } = useSession();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 glass">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <a key={n.label} href={n.hash ? `#${n.hash}` : "/"} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Button asChild><Link to="/dashboard">Open Dashboard</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost"><Link to="/auth" search={{ mode: "signin" }}>Log In</Link></Button>
              <Button asChild className="bg-gradient-primary shadow-glow"><Link to="/auth" search={{ mode: "signup" }}>Get Started</Link></Button>
            </>
          )}
        </div>
        <button className="md:hidden rounded-md p-2 hover:bg-accent/40" onClick={() => setOpen(!open)} aria-label="menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-border/50 bg-card md:hidden">
          <div className="flex flex-col gap-1 px-4 py-3">
            {nav.map((n) => (
              <a key={n.label} onClick={() => setOpen(false)} href={n.hash ? `#${n.hash}` : "/"} className="rounded-md px-3 py-2 text-sm">{n.label}</a>
            ))}
            {user ? (
              <Link to="/dashboard" className="mt-2 rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground">Dashboard</Link>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link to="/auth" search={{ mode: "signin" }} className="flex-1 rounded-md border px-3 py-2 text-center text-sm">Log In</Link>
                <Link to="/auth" search={{ mode: "signup" }} className="flex-1 rounded-md bg-gradient-primary px-3 py-2 text-center text-sm text-primary-foreground">Get Started</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
