import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border bg-brand text-brand-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo className="text-brand-foreground" />
          <p className="mt-3 max-w-sm text-sm text-brand-foreground/70">
            Learn today. Lead tomorrow. AI-powered learning for South African learners — CAPS-aligned academics, tech skills, robotics and more.
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Platform</h4>
          <ul className="space-y-2 text-sm text-brand-foreground/70">
            <li><a href="#features">Features</a></li>
            <li><a href="#subjects">Subjects</a></li>
            <li><a href="#ai">AI Assistant</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Contact</h4>
          <ul className="space-y-2 text-sm text-brand-foreground/70">
            <li>hello@learnchief.co.za</li>
            <li>Cape Town, South Africa</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-brand-foreground/10 py-4 text-center text-xs text-brand-foreground/50">
        © {new Date().getFullYear()} Learn Chief. All rights reserved.
      </div>
    </footer>
  );
}
