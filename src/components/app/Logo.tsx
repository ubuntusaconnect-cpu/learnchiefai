import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

export function Logo({ className = "", showText = true }: { className?: string; showText?: boolean }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-display font-bold ${className}`}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
        <GraduationCap className="h-5 w-5" />
      </span>
      {showText && (
        <span className="text-lg tracking-tight">
          LEARN <span className="text-primary">CHIEF</span>
        </span>
      )}
    </Link>
  );
}
