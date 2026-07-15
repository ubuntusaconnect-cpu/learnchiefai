import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "student" | "teacher" | "admin";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<User | null> => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 60_000,
  });
}

export function useRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<AppRole[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function primaryRole(roles: AppRole[] | undefined): AppRole {
  if (!roles || roles.length === 0) return "student";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teacher")) return "teacher";
  return "student";
}
