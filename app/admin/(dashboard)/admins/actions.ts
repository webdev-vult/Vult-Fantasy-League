"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  ADMIN_ROLES,
  requireAdminRole,
  type AdminRole,
} from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const SUPER_ADMIN_ROLES = ["super_admin"] as const;

export type CreateAdminUserState = {
  error: string | null;
  success: string | null;
  email: string | null;
  temporaryPassword: string | null;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateTemporaryPassword() {
  return `${randomBytes(18).toString("base64url")}!Aa9`;
}

export async function createAdminUserAction(
  _previousState: CreateAdminUserState,
  formData: FormData,
): Promise<CreateAdminUserState> {
  const requestedBy = await requireAdminRole(SUPER_ADMIN_ROLES);
  const fullName = text(formData, "full_name").replace(/\s+/g, " ");
  const email = text(formData, "email").toLowerCase();
  const roleValue = text(formData, "role");

  if (fullName.length < 3 || fullName.length > 120) {
    return {
      error: "Enter the administrator's full name.",
      success: null,
      email: null,
      temporaryPassword: null,
    };
  }

  if (!isValidEmail(email) || email.length > 254) {
    return {
      error: "Enter a valid administrator email address.",
      success: null,
      email: null,
      temporaryPassword: null,
    };
  }

  if (!ADMIN_ROLES.includes(roleValue as AdminRole)) {
    return {
      error: "Select a valid administrator role.",
      success: null,
      email: null,
      temporaryPassword: null,
    };
  }

  const role = roleValue as AdminRole;
  const temporaryPassword = generateTemporaryPassword();
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
    app_metadata: {
      vult_fantasy_admin_role: role,
    },
  });

  if (authError || !authData.user) {
    const duplicate = authError?.message.toLowerCase().includes("already") ?? false;
    return {
      error: duplicate
        ? "An authentication account with this email already exists."
        : `Unable to create the administrator login${authError?.message ? `: ${authError.message}` : "."}`,
      success: null,
      email: null,
      temporaryPassword: null,
    };
  }

  const userId = authData.user.id;
  const { error: profileError } = await db.from("admin_profiles").insert({
    id: userId,
    full_name: fullName,
    role,
    is_active: true,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    return {
      error: `The login was rolled back because the administrator profile could not be created: ${profileError.message}`,
      success: null,
      email: null,
      temporaryPassword: null,
    };
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_user_id: requestedBy.id,
    action: "create_admin_user",
    entity_type: "admin_profile",
    entity_id: userId,
    metadata: {
      full_name: fullName,
      email,
      role,
      creation_method: "admin_panel_temporary_password",
    },
  });

  if (auditError) {
    await supabase.auth.admin.deleteUser(userId);
    return {
      error: "The administrator account was rolled back because its audit event could not be recorded.",
      success: null,
      email: null,
      temporaryPassword: null,
    };
  }

  revalidatePath("/admin/admins");

  return {
    error: null,
    success: `${fullName} was added as ${role.replaceAll("_", " ")}.`,
    email,
    temporaryPassword,
  };
}
