import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type AdminProfile = Tables<"admin_profiles">;

export const getCurrentAdmin = cache(async (): Promise<AdminProfile | null> => {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return null;
  }

  const { data: admin, error: adminError } = await supabase
    .from("admin_profiles")
    .select("id, full_name, role, is_active, created_at, updated_at")
    .eq("id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError || !admin) {
    return null;
  }

  return admin;
});

export async function requireAdmin() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login?error=not_authorized");
  }

  return admin;
}
