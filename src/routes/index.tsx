import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LandingNav } from "@/components/app/LandingNav";
import { Footer } from "@/components/app/Footer";
import { Button } from "@/components/ui/button";
import {
  Sparkles, BookOpen, Code, Bot, ShieldCheck, WifiOff, GraduationCap,
  ArrowRight, CheckCircle2, Rocket, Trophy, MessagesSquare, PenTool,
  Sigma, FlaskConical, Leaf, Globe, Cpu, Palette, Briefcase,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  component: Landing,
});

const iconMap: Record<string, any> = {
  Sigma, FlaskConical, Leaf, BookOpen, Code, Globe, Bot, Cpu, Palette, Briefcase,
};

function Landing() {
  const { data: subjects } = useQuery({
    queryKey: ["public-subjects"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").order("name");
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(120,150,255,0.35), transparent 40%), radial-gradient(circle at 80% 60%, rgba(80,200,255,0.25), transparent 45%)" }} />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs backdrop-blur">
              <Sparkles className="h-3 w-3" /> New — AI Study Assistant for every learner
            </span>
            <h1 className="mt-5 text-5xl font-bold tracking-tight md:text-6xl">
              Smarter Learning.
              <br />
              <span className="bg-gradient-to-r from-primary-glow to-accent bg-clip-text text-transparent">Stronger Future.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/70">
              The all-in-one learning platform for South African learners. Master academics, tech skills, robotics and coding — with AI-powered support anytime.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gradient-primary shadow-glow">
                <Link to="/auth" search={{ mode: "signup" }}>Get Started Free <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                <a href="#subjects">Explore Courses</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <span className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI Study Assistant</span>
              <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" /> Offline Learning</span>
              <span className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Expert Teachers</span>
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Secure & Trusted</span>
            </div>
          </div>
          <div className="relative">
            <div className="glass rounded-3xl border-white/10 p-6 shadow-elegant">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center"><Bot className="h-4 w-4 text-white" /></div>
                <div>
                  <div className="text-sm font-semibold">AI Assistant</div>
                  <div className="text-xs text-white/60">Ready to help you learn</div>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl rounded-tl-sm bg-white/10 p-3">Explain photosynthesis for Grade 10.</div>
                <div className="rounded-2xl rounded-tr-sm bg-gradient-primary p-3">
                  Photosynthesis is how plants turn sunlight, water and CO₂ into glucose and oxygen. Let's break it down…
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-white/10 p-3">Quiz me on the light-dependent reactions.</div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 hidden rounded-2xl bg-card p-4 text-foreground shadow-elegant md:block">
              <div className="text-xs text-muted-foreground">Your Progress</div>
              <div className="mt-1 text-2xl font-bold">75%</div>
              <div className="text-xs text-primary">Keep it up!</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Features</p>
          <h2 className="mt-2 text-4xl font-bold">Everything a learner needs</h2>
          <p className="mt-3 text-muted-foreground">Built for South African schools, homeschoolers and future engineers.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: BookOpen, title: "Learn Any Subject", desc: "CAPS-aligned content for all grades and subjects.", tint: "bg-primary/10 text-primary" },
            { icon: Code, title: "Tech Skills", desc: "Coding, Robotics, Design, AI, and more.", tint: "bg-accent/20 text-accent-foreground" },
            { icon: Bot, title: "AI Study Assistant", desc: "Get instant help and explanations, 24/7.", tint: "bg-primary-glow/20 text-primary" },
            { icon: WifiOff, title: "Offline Learning", desc: "Download lessons and study anywhere.", tint: "bg-accent/10 text-primary" },
            { icon: Trophy, title: "Track Progress", desc: "Monitor your growth and achievements.", tint: "bg-primary/10 text-primary" },
            { icon: MessagesSquare, title: "Expert Teachers", desc: "Verified educators upload real classroom content.", tint: "bg-primary-glow/10 text-primary" },
          ].map((f) => (
            <div key={f.title} className="group rounded-2xl border bg-card p-6 shadow-card transition hover:-translate-y-1 hover:shadow-elegant">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.tint}`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="mb-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it Works</p>
            <h2 className="mt-2 text-4xl font-bold">Start learning in 3 steps</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "01", title: "Create your account", desc: "Sign up as a student or teacher in seconds." },
              { n: "02", title: "Pick your subjects", desc: "Browse CAPS courses and technology skills." },
              { n: "03", title: "Learn with AI", desc: "Watch lessons, take quizzes, and chat with your AI tutor." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border bg-card p-8 shadow-card">
                <div className="text-4xl font-bold text-primary">{s.n}</div>
                <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SUBJECTS */}
      <section id="subjects" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Explore Courses</p>
            <h2 className="mt-2 text-4xl font-bold">Learn What Matters</h2>
            <p className="mt-2 text-muted-foreground">Academic subjects. Technical skills. Real-world knowledge.</p>
          </div>
          <Button asChild variant="outline"><Link to="/auth" search={{ mode: "signup" }}>View All Courses</Link></Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(subjects ?? []).slice(0, 8).map((s) => {
            const Icon = iconMap[s.icon ?? "BookOpen"] ?? BookOpen;
            return (
              <div key={s.id} className="group rounded-2xl border bg-gradient-card p-6 shadow-card transition hover:-translate-y-1 hover:shadow-elegant">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{s.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                <div className="mt-3 text-xs uppercase tracking-wider text-primary">{s.category}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI SECTION */}
      <section id="ai" className="bg-gradient-hero py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary-glow">AI Study Assistant</p>
            <h2 className="mt-2 text-4xl font-bold">Your personal tutor, always on.</h2>
            <p className="mt-4 text-white/70">Ask questions, get step-by-step maths solutions, debug your code, generate revision notes and quizzes. Focused on learning — not chit-chat.</p>
            <ul className="mt-6 space-y-3 text-sm">
              {["Explain difficult concepts simply", "Solve mathematics step by step", "Debug code and teach programming", "Generate revision notes and quizzes", "Recommend the next lesson"].map((x) => (
                <li key={x} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" /> {x}</li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 bg-white text-brand hover:bg-white/90">
              <Link to="/auth" search={{ mode: "signup" }}>Try the AI Assistant <Rocket className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="glass rounded-3xl border-white/10 p-6">
            <div className="flex items-center gap-2 text-xs text-white/60"><Bot className="h-4 w-4" /> AI Assistant · learn mode</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl rounded-tl-sm bg-white/10 p-3">Solve 3x + 5 = 20 and explain each step.</div>
              <div className="rounded-2xl rounded-tr-sm bg-gradient-primary p-3 font-mono">
                Step 1: 3x + 5 = 20{"\n"}Step 2: 3x = 15{"\n"}Step 3: x = 5 ✅
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-white/10 p-3">Create 5 revision questions on this topic.</div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Loved by learners</p>
          <h2 className="mt-2 text-4xl font-bold">Real stories, real progress</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { name: "Thato M.", role: "Grade 11 Learner", quote: "The AI Assistant explains maths in a way that finally makes sense." },
            { name: "Ms. Dlamini", role: "Physical Sciences Teacher", quote: "Uploading lessons and tracking my class is effortless." },
            { name: "Kabelo R.", role: "Coding & Robotics", quote: "I built my first Python game in a weekend. Life-changing." },
          ].map((t) => (
            <div key={t.name} className="rounded-2xl border bg-card p-6 shadow-card">
              <PenTool className="h-4 w-4 text-primary" />
              <p className="mt-3 text-sm">"{t.quote}"</p>
              <div className="mt-4 text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-y bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">FAQ</p>
            <h2 className="mt-2 text-4xl font-bold">Common questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "Is Learn Chief aligned with the South African CAPS curriculum?", a: "Yes. Our academic subjects are structured around CAPS from Grade 8 to 12, with additional tech and STEM tracks." },
              { q: "Can I use the platform offline?", a: "Yes. Learn Chief works as a Progressive Web App — install it and access downloaded lessons offline." },
              { q: "Is the AI Study Assistant safe for learners?", a: "The assistant is tuned for education only, filtered for age-appropriate responses, and every conversation is private to the learner." },
              { q: "Can teachers upload their own lessons?", a: "Absolutely. Verified teachers can create courses, upload notes and videos, and track learner performance." },
              { q: "Is it free?", a: "Learn Chief is free to get started. Premium content and school-wide plans are available." },
            ].map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-4xl font-bold">Ready to lead tomorrow?</h2>
        <p className="mt-3 text-muted-foreground">Join thousands of learners already building their future with Learn Chief.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-gradient-primary shadow-glow"><Link to="/auth" search={{ mode: "signup" }}>Get Started Free</Link></Button>
          <Button asChild size="lg" variant="outline"><a href="mailto:hello@learnchief.co.za">Contact Us</a></Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
