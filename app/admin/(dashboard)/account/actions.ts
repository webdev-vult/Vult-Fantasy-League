"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

function passwordValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function hasStrongPassword(value: string) {
  return (
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export async function changeAdminPasswordAction(formData: FormData) {
  const admin = await requireAdmin();
  const password = passwordValue(formData, "password");
  const confirmation = passwordValue(formData, "confirm_password");

  if (!hasStrongPassword(password)) {
    redirect("/admin/account?error=weak_password");
  }

  if (password !== confirmation) {
    redirect("/admin/account?error=password_mismatch");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/admin/account?error=password_update_failed");
  }

  const adminClient = createAdminSupabaseClient();
  const { error: metadataError } = await adminClient.auth.admin.updateUserById(admin.id, {
    app_metadata: {
      vult_fantasy_admin_role: admin.role,
      must_change_password: false,
    },
  });

  if (metadataError) {
    redirect("/admin/account?error=password_flag_update_failed");
  }

  // The access guard reads must_change_password from the signed-in user's JWT.
  // Admin metadata changes do not rewrite an already-issued access token, so
  // refresh the session before redirecting away from the account page.
  const { error: refreshError } = await supabase.auth.refreshSession();

  if (refreshError) {
    await supabase.auth.signOut();
    redirect("/admin/login?notice=password_changed_sign_in_again");
  }

  redirect("/admin/account?success=password_changed");
}
