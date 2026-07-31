"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const MANAGEMENT_ROLES = ["super_admin", "competition_manager"] as const;

const SEASON_STATUSES = ["draft", "active", "completed", "archived"] as const;
const COMPETITION_SEASON_STATUSES = [
  "draft",
  "registration_open",
  "registration_closed",
  "active",
  "completed",
  "archived",
  "cancelled",
] as const;
const DATA_PROVIDERS = ["mock", "csv", "approved_fpl", "licensed"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function toIsoDateTime(formData: FormData, key: string, label: string) {
  const value = text(formData, key);

  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return parsed.toISOString();
}

function toDate(formData: FormData, key: string, label: string) {
  const value = text(formData, key);

  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return value;
}

function positiveInteger(formData: FormData, key: string, label: string) {
  const value = Number.parseInt(text(formData, key), 10);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be at least 1.`);
  }

  return value;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertAllowed<T extends readonly string[]>(
  value: string,
  allowed: T,
  label: string,
): T[number] {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${label} is invalid.`);
  }

  return value as T[number];
}

function redirectWithMessage(type: "success" | "error", message: string): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`/admin/competitions?${params.toString()}`);
}

async function writeAuditLog(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Json,
) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });

  if (error) {
    console.error("Unable to write competition audit log", error.message);
  }
}

export async function createCompetitionAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);

  try {
    const name = requiredText(formData, "name", "Competition name");
    const requestedSlug = optionalText(formData, "slug");
    const slug = slugify(requestedSlug ?? name);

    if (!slug) {
      throw new Error("Competition slug is invalid.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("competitions")
      .insert({
        name,
        slug,
        description: optionalText(formData, "description"),
        is_active: true,
      })
      .select("id, name, slug")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create the competition.");
    }

    await writeAuditLog(admin.id, "create_competition", "competition", data.id, {
      name: data.name,
      slug: data.slug,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create the competition.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/competitions");
  redirectWithMessage("success", "Competition created successfully.");
}

export async function createSeasonAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);

  try {
    const name = requiredText(formData, "name", "Season name");
    const code = requiredText(formData, "code", "Season code");
    const status = assertAllowed(
      requiredText(formData, "status", "Season status"),
      SEASON_STATUSES,
      "Season status",
    );
    const startsOn = toDate(formData, "starts_on", "Season start date");
    const endsOn = toDate(formData, "ends_on", "Season end date");

    if (startsOn && endsOn && endsOn < startsOn) {
      throw new Error("Season end date cannot be before the start date.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("seasons")
      .insert({
        name,
        code,
        status,
        starts_on: startsOn,
        ends_on: endsOn,
      })
      .select("id, name, code")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create the season.");
    }

    await writeAuditLog(admin.id, "create_season", "season", data.id, {
      name: data.name,
      code: data.code,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create the season.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/competitions");
  redirectWithMessage("success", "Season created successfully.");
}

export async function createCompetitionSeasonAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);

  try {
    const competitionId = requiredText(formData, "competition_id", "Competition");
    const seasonId = requiredText(formData, "season_id", "Season");
    const name = requiredText(formData, "name", "Competition season name");
    const requestedSlug = optionalText(formData, "slug");
    const slug = slugify(requestedSlug ?? name);
    const status = assertAllowed(
      requiredText(formData, "status", "Competition status"),
      COMPETITION_SEASON_STATUSES,
      "Competition status",
    );
    const dataProvider = assertAllowed(
      requiredText(formData, "data_provider", "Data provider"),
      DATA_PROVIDERS,
      "Data provider",
    );
    const registrationOpensAt = toIsoDateTime(
      formData,
      "registration_opens_at",
      "Registration opening time",
    );
    const registrationClosesAt = toIsoDateTime(
      formData,
      "registration_closes_at",
      "Registration closing time",
    );
    const startsAt = toIsoDateTime(formData, "starts_at", "Competition start time");
    const endsAt = toIsoDateTime(formData, "ends_at", "Competition end time");

    if (registrationOpensAt && registrationClosesAt && registrationClosesAt < registrationOpensAt) {
      throw new Error("Registration closing time cannot be before the opening time.");
    }

    if (startsAt && endsAt && endsAt < startsAt) {
      throw new Error("Competition end time cannot be before the start time.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("competition_seasons")
      .insert({
        competition_id: competitionId,
        season_id: seasonId,
        name,
        slug,
        status,
        data_provider: dataProvider,
        external_league_id: optionalText(formData, "external_league_id"),
        registration_opens_at: registrationOpensAt,
        registration_closes_at: registrationClosesAt,
        starts_at: startsAt,
        ends_at: endsAt,
        rules_version: positiveInteger(formData, "rules_version", "Rules version"),
        settings: {},
      })
      .select("id, name, status, data_provider")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create the competition season.");
    }

    await writeAuditLog(admin.id, "create_competition_season", "competition_season", data.id, {
      name: data.name,
      status: data.status,
      data_provider: data.data_provider,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create the competition season.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/competitions");
  redirectWithMessage("success", "Competition season created successfully.");
}

export async function updateCompetitionSeasonAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);

  try {
    const id = requiredText(formData, "id", "Competition season");
    const name = requiredText(formData, "name", "Competition season name");
    const status = assertAllowed(
      requiredText(formData, "status", "Competition status"),
      COMPETITION_SEASON_STATUSES,
      "Competition status",
    );
    const dataProvider = assertAllowed(
      requiredText(formData, "data_provider", "Data provider"),
      DATA_PROVIDERS,
      "Data provider",
    );
    const registrationOpensAt = toIsoDateTime(
      formData,
      "registration_opens_at",
      "Registration opening time",
    );
    const registrationClosesAt = toIsoDateTime(
      formData,
      "registration_closes_at",
      "Registration closing time",
    );
    const startsAt = toIsoDateTime(formData, "starts_at", "Competition start time");
    const endsAt = toIsoDateTime(formData, "ends_at", "Competition end time");

    if (registrationOpensAt && registrationClosesAt && registrationClosesAt < registrationOpensAt) {
      throw new Error("Registration closing time cannot be before the opening time.");
    }

    if (startsAt && endsAt && endsAt < startsAt) {
      throw new Error("Competition end time cannot be before the start time.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("competition_seasons")
      .update({
        name,
        status,
        data_provider: dataProvider,
        external_league_id: optionalText(formData, "external_league_id"),
        registration_opens_at: registrationOpensAt,
        registration_closes_at: registrationClosesAt,
        starts_at: startsAt,
        ends_at: endsAt,
        rules_version: positiveInteger(formData, "rules_version", "Rules version"),
      })
      .eq("id", id)
      .select("id, name, status, data_provider")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to update the competition season.");
    }

    await writeAuditLog(admin.id, "update_competition_season", "competition_season", data.id, {
      name: data.name,
      status: data.status,
      data_provider: data.data_provider,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to update the competition season.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/competitions");
  redirectWithMessage("success", "Competition season updated successfully.");
}
