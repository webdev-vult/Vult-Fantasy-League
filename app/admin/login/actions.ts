"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function safeAdminRedirect(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "/admin";
  }

  if (!value.startsWith("/admin") || value.startsWith("//")) {
    return "/admin";
  }

  return value;
}

export async function signInAdmin(formData: FormData) {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const destination = safeAdminRedirect(formData.get("next"));

  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || !password) {
    redirect(`/admin/login?error=missing_credentials&next=${encodeURIComponent(destination)}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(`/admin/login?error=invalid_credentials&next=${encodeURIComponent(destination)}`);
  }

  const { data: admin, error: adminError } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError || !admin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_authorized");
  }

  redirect(destination);
}
