/**
 * Real, server-backed activity + presence tracking.
 *
 * Every write goes through a database function that derives the user from the
 * verified session (`auth.uid()`), so the browser cannot forge another user's
 * login, logout, presence or activity.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "lc_session_id";
/** Presence timeout used by the admin console (kept in sync with the database). */
export const PRESENCE_WINDOW_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 45_000;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
}

/** Stable id for this browser session (one per tab session). */
export function currentSessionId(): string | null {
  if (typeof window === "undefined") return null;
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Records a real, successful login. Returns the account status from the server. */
export async function recordLogin(method: string): Promise<"active" | "inactive" | "suspended"> {
  if (typeof window === "undefined") return "active";
  sessionStorage.removeItem(SESSION_KEY);
  const sessionId = currentSessionId()!;
  const { data, error } = await supabase.rpc("record_login", {
    _session_id: sessionId,
    _method: method,
    _platform: navigator.platform ?? undefined,
    _user_agent: navigator.userAgent.slice(0, 400),
  });
  if (error) {
    console.error("[activity] login not recorded", error.message);
    return "active";
  }
  const status = (data as { account_status?: string } | null)?.account_status;
  return status === "inactive" || status === "suspended" ? status : "active";
}

/** Records an explicit sign-out. Never called for tab closes or lost connections. */
export async function recordLogout(): Promise<void> {
  const sessionId = typeof window === "undefined" ? null : sessionStorage.getItem(SESSION_KEY);
  const { error } = await supabase.rpc("record_logout", { _session_id: sessionId ?? undefined });
  if (error) console.error("[activity] logout not recorded", error.message);
  if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}

/** Records a meaningful activity event (no private content is stored). */
export async function logActivity(
  eventType: string,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const { error } = await supabase.rpc("log_activity", {
    _event_type: eventType,
    _session_id: currentSessionId() ?? undefined,
    _metadata: metadata as never,
  });
  if (error) console.error("[activity] event not recorded", error.message);
}

async function heartbeat() {
  const { error } = await supabase.rpc("touch_presence", { _session_id: currentSessionId() ?? undefined });
  if (error) console.error("[activity] presence not updated", error.message);
}

/**
 * Presence heartbeat: writes roughly once a minute and only while the tab is
 * actually visible, so a forgotten open tab stops counting as "online".
 */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void heartbeat();
    };
    tick();
    timer = setInterval(tick, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled]);
}

/** Logs a page-level activity event whenever the pathname changes. */
export function useActivityTracker(enabled: boolean, pathname: string) {
  useEffect(() => {
    if (!enabled) return;
    const map: Array<[RegExp, string]> = [
      [/^\/dashboard/, "open_dashboard"],
      [/^\/courses\/[^/]+/, "open_course"],
      [/^\/courses/, "browse_courses"],
      [/^\/lessons\//, "open_lesson"],
      [/^\/assistant/, "open_assistant"],
      [/^\/papers/, "open_papers"],
      [/^\/watch\//, "open_video"],
      [/^\/settings/, "open_settings"],
      [/^\/admin/, "open_admin"],
    ];
    const match = map.find(([re]) => re.test(pathname));
    if (!match) return;
    void logActivity(match[1], { path: pathname.slice(0, 120) });
  }, [enabled, pathname]);
}

/** Human friendly "3 minutes ago". */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

/** 16 Aug 2026, 21:42 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
