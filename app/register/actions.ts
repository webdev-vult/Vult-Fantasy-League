"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveOfficialFplLeagueIdentity } from "@/lib/fantasy-providers/fpl-league-identity";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type RegistrationState = {
  error: string | null;
};

const SAFE_MESSAGES = [
  "Registration is not currently open.",
  "Registration is not currently available.",
  "Too many registration attempts. Please wait a few minutes and try again.",
  "You must accept the competition rules and privacy notice.",
  "You must confirm that you meet the minimum age requirement.",
  "Enter your full legal name.",
  "Enter a valid phone number.",
  "Enter a valid email address.",
  "Your country is not eligible for this competition.",
  "Enter your exact FPL team name.",
  "Enter your exact FPL manager name.",
  "The FPL team could not be resolved to a valid Entry ID.",
  "No matching team was found in the official Vult FPL league.",
  "More than one matching team was found. Contact Vult support.",
  "This phone number is already linked to a participant. Contact support to register for another season.",
  "You are already registered for this competition season.",
  "A participant, email address, or FPL team in this registration is already in use.",
  "Unable to submit this registration.",
];

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeErrorMessage(message: string) {
  if (message.includes("FPL league lookup returned HTTP") || message.includes("could not be checked")) {
    return "The official FPL league is temporarily unavailable. Please try again shortly.";
  }

  return SAFE_MESSAGES.find((safeMessage) => message.includes(safeMessage)) ??
    "We could not submit your registration. Review your details and try again.";
}

function normalizeRateLimitValue(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function rateLimitKey(kind: string, rawValue: string) {
  const secret = process.env.REGISTRATION_RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Registration is not currently available.");

  return createHmac("sha256", secret)
    .update(`${kind}:${rawValue}`)
    .digest("hex");
}

async function consumeRateLimit(
  db: any,
  keyHash: string,
  limit: number,
  windowSeconds = 600,
) {
  const { data, error } = await db.rpc("consume_public_registration_rate_limit", {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) throw new Error("Registration is not currently available.");
  const result = Array.isArray(data) ? data[0] : data;
  return result?.allowed === true;
}

async function enforceRegistrationRateLimits(
  db: any,
  input: {
    competitionSlug: string;
    phone: string;
    teamName: string;
    managerName: string;
  },
) {
  const requestHeaders = await headers();
  const forwardedFor =
    requestHeaders.get("x-vercel-forwarded-for") ?? requestHeaders.get("x-forwarded-for") ?? "";
  const clientIp = forwardedFor.split(",")[0]?.trim() ?? "";

  const identity = [
    input.competitionSlug,
    normalizeRateLimitValue(input.phone),
    normalizeRateLimitValue(input.teamName),
    normalizeRateLimitValue(input.managerName),
  ].join("|");

  const identityAllowed = await consumeRateLimit(
    db,
    rateLimitKey("registration-identity", identity),
    5,
  );
  if (!identityAllowed) {
    throw new Error("Too many registration attempts. Please wait a few minutes and try again.");
  }

  if (clientIp) {
    const ipAllowed = await consumeRateLimit(
      db,
      rateLimitKey("registration-ip", `${input.competitionSlug}|${clientIp}`),
      12,
    );
    if (!ipAllowed) {
      throw new Error("Too many registration attempts. Please wait a few minutes and try again.");
    }
  }
}

export async function submitRegistrationAction(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const competitionSlug = value(formData, "competition_slug");
  const teamName = value(formData, "fpl_team_name");
  const managerName = value(formData, "fpl_manager_name");
  const phone = value(formData, "phone");

  if (value(formData, "company")) {
    return { error: "Unable to submit this registration." };
  }

  if (!competitionSlug || !teamName || !managerName) {
    return { error: "Complete all required registration fields." };
  }

  if (formData.get("age_confirmed") !== "on") {
    return { error: "You must confirm that you meet the minimum age requirement." };
  }

  let data: any;

  try {
    const db = createAdminSupabaseClient() as any;
    const { data: season, error: seasonError } = await db
      .from("competition_seasons")
      .select("id, external_league_id")
      .eq("slug", competitionSlug)
      .single();

    if (seasonError || !season) {
      return { error: "Registration is not currently available." };
    }

    const leagueId = String(season.external_league_id ?? "").trim();
    if (!/^\d+$/.test(leagueId)) {
      return { error: "The official Vult FPL league is not configured yet." };
    }

    await enforceRegistrationRateLimits(db, {
      competitionSlug,
      phone,
      teamName,
      managerName,
    });

    const resolved = await resolveOfficialFplLeagueIdentity({
      leagueId,
      teamName,
      managerName,
    });

    const response = await db.rpc("submit_public_registration", {
      p_competition_season_slug: competitionSlug,
      p_full_name: value(formData, "full_name"),
      p_phone: phone,
      p_whatsapp_phone: value(formData, "whatsapp_phone"),
      p_email: value(formData, "email"),
      p_country: value(formData, "country"),
      p_fpl_entry_id: resolved.entryId,
      p_fpl_team_name: resolved.teamName,
      p_fpl_manager_name: resolved.managerName,
      p_age_confirmed: formData.get("age_confirmed") === "on",
      p_rules_consent: formData.get("rules_consent") === "on",
      p_privacy_consent: formData.get("privacy_consent") === "on",
      p_publicity_consent: formData.get("publicity_consent") === "on",
      p_honeypot: value(formData, "company"),
    });

    if (response.error) return { error: safeErrorMessage(response.error.message) };
    data = response.data;
  } catch (error) {
    console.error("Public registration error", error);
    return {
      error: safeErrorMessage(
        error instanceof Error ? error.message : "Unable to submit this registration.",
      ),
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const reference = result?.registration_reference;

  if (!reference) {
    return { error: "Your registration was received, but the confirmation reference was unavailable." };
  }

  redirect(`/register/success?reference=${encodeURIComponent(reference)}`);
}
