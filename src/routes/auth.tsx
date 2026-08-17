import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { recordLogin } from "@/lib/activity";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot", "reset"]).optional().default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">(mode === "signup" ? "signup" : "signin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "reset") return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [mode, navigate]);

  if (mode === "reset") return <ResetForm />;
  if (mode === "forgot") return <ForgotForm />;

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="mx-auto max-w-md pt-6">
        <Logo className="text-white" />
      </div>
      <div className="mx-auto mt-8 max-w-md rounded-3xl border bg-card p-6 shadow-elegant sm:p-8">
        <h1 className="text-2xl font-bold">{tab === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === "signin" ? "Log in to continue learning." : "Start learning today."}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
            if (res.error) { toast.error("Google sign-in failed"); setBusy(false); return; }
            if (!res.redirected) {
              const status = await recordLogin("google");
              if (status === "suspended") {
                await supabase.auth.signOut();
                setBusy(false);
                return toast.error("This account has been suspended. Please contact LearnChief support.");
              }
              navigate({ to: "/dashboard" });
            }
          }}
        >
          Continue with Google
        </Button>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or continue with email <div className="h-px flex-1 bg-border" />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Log In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-4"><SignInForm busy={busy} setBusy={setBusy} /></TabsContent>
          <TabsContent value="signup" className="mt-4"><SignUpForm busy={busy} setBusy={setBusy} /></TabsContent>
        </Tabs>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ busy, setBusy }: { busy: boolean; setBusy: (b: boolean) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      // Deliberately generic: never reveal whether the account exists.
      return toast.error("Incorrect email or password.");
    }
    const status = await recordLogin("password");
    if (status === "suspended") {
      await supabase.auth.signOut();
      setBusy(false);
      return toast.error("This account has been suspended. Please contact LearnChief support.");
    }
    // Destination comes from the user's real role in the database, never from
    // the email they typed or anything stored in the browser.
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: signIn.user!.id,
      _role: "admin",
    });
    setBusy(false);
    toast.success("Welcome back!");
    navigate({ to: isAdmin === true ? "/admin" : "/dashboard" });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="text-right text-xs">
        <Link to="/auth" search={{ mode: "forgot" }} className="text-primary hover:underline">Forgot password?</Link>
      </div>
      <Button type="submit" className="w-full bg-gradient-primary" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Log In
      </Button>
    </form>
  );
}

function SignUpForm({ busy, setBusy }: { busy: boolean; setBusy: (b: boolean) => void }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, role },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! You're logged in.");
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="signup-password">Password</Label>
        <Input id="signup-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div>
        <Label>I am a</Label>
        <RadioGroup value={role} onValueChange={(v) => setRole(v as "student" | "teacher")} className="mt-2 grid grid-cols-2 gap-2">
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${role === "student" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="student" /> Student
          </label>
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${role === "teacher" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="teacher" /> Teacher
          </label>
        </RadioGroup>
      </div>
      <Button type="submit" className="w-full bg-gradient-primary" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
      </Button>
    </form>
  );
}

function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent.");
  }
  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="mx-auto max-w-md pt-6"><Logo className="text-white" /></div>
      <form onSubmit={submit} className="mx-auto mt-8 max-w-md space-y-4 rounded-3xl border bg-card p-8 shadow-elegant">
        <h1 className="text-2xl font-bold">Reset password</h1>
        <p className="text-sm text-muted-foreground">Enter your email — we'll send you a link.</p>
        <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send reset link</Button>
        <div className="text-center text-xs"><Link to="/auth" search={{ mode: "signin" }} className="text-primary">Back to login</Link></div>
      </form>
    </div>
  );
}

function ResetForm() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated!");
    navigate({ to: "/dashboard" });
  }
  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="mx-auto max-w-md pt-6"><Logo className="text-white" /></div>
      <form onSubmit={submit} className="mx-auto mt-8 max-w-md space-y-4 rounded-3xl border bg-card p-8 shadow-elegant">
        <h1 className="text-2xl font-bold">Set new password</h1>
        <Input type="password" required minLength={8} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password</Button>
      </form>
    </div>
  );
}
