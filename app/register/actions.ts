"use server";

import { redirect } from "next/navigation";
import { resolveOfficialFplLeagueIdentity } from "@/lib/fantasy-providers/fpl-league-identity";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type RegistrationState = {
  error: string | null;
};

const SAFE_MESSAGES = [
  "Registration is not currently open.",
  "Registration is not currently available.",
  "You must accept the competition rules and privacy notice.",
  "You must confirm that you are at least",
  "Enter your full legal name.",
  "Enter a valid phone number.",
  "Enter a valid email address.",
  "Your country is not eligible for this competition.",
  "Enter the team name exactly as it appears in the Vult FPL league.",
  "Enter the manager name exactly as it appears in the Vult FPL league.",
  "This phone number is already linked to a participant. Contact support to register for another season.",
  "You are already registered for this competition season.",
  "A participant, email address, or FPL team in this registration is already in use.",
  "Unable to submit this registration.",
];

const FPL_LOOKUP_MESSAGES = [
  "We could not find that Team name and Manager name in the official Vult FPL league. Join the league first and enter both names exactly as shown in FPL.",
  "More than one Vult FPL entry matches those names. Contact Vult support so the correct team can be verified.",
  "The matching FPL league entry does not contain a valid Entry ID.",
  "The official FPL league ID is invalid.",
  "The FPL league could not be checked at this time.",
  "FPL returned HTTP",
];

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeErrorMessage(message: string) {
  return SAFE_MESSAGES.find((safeMessage) => message.includes(safeMessage)) ??
    "We could not submit your registration. Review your details and try again.";
}

function safeFplLookupMessage(message: string) {
  if (FPL_LOOKUP_MESSAGES.some((safeMessage) => message.includes(safeMessage))) {
    return message.includes("FPL returned HTTP") || message.includes("could not be checked")
      ? "The official FPL league is temporarily unavailable. Please try again shortly."
      : message;
  }

  return "We could not verify your team in the official Vult FPL league. Check the Team name and Manager name and try again.";
}

export async function submitRegistrationAction(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const competitionSlug = value(formData, "competition_slug");
  const teamName = value(formData, "team_name");
  const managerName = value(formData, "manager_name");

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

    let identity;
    try {
      identity = await resolveOfficialFplLeagueIdentity({
        leagueId,
        teamName,
        managerName,
      });
    } catch (error) {
      return {
        error: safeFplLookupMessage(
          error instanceof Error ? error.message : "The FPL league could not be checked at this time.",
        ),
      };
    }

    const response = await db.rpc("submit_public_registration_by_league_identity", {
      p_competition_season_slug: competitionSlug,
      p_full_name: value(formData, "full_name"),
      p_phone: value(formData, "phone"),
      p_whatsapp_phone: value(formData, "whatsapp_phone"),
      p_email: value(formData, "email"),
      p_country: value(formData, "country"),
      p_fpl_entry_id: identity.entryId,
      p_fpl_team_name: identity.teamName,
      p_fpl_manager_name: identity.managerName,
      p_age_confirmed: formData.get("age_confirmed") === "on",
      p_rules_consent: formData.get("rules_consent") === "on",
      p_privacy_consent: formData.get("privacy_consent") === "on",
      p_publicity_consent: formData.get("publicity_consent") === "on",
      p_honeypot: value(formData, "company"),
    });

    if (response.error) {
      return { error: safeErrorMessage(response.error.message) };
    }

    data = response.data;
  } catch (error) {
    console.error("Public registration configuration error", error);
    return {
      error:
        "Registration is temporarily unavailable. Please try again later or contact Vult support.",
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const reference = result?.registration_reference;

  if (!reference) {
    return {
      error:
        "Your registration was received, but the confirmation reference was unavailable.",
    };
  }

  redirect(`/register/success?reference=${encodeURIComponent(reference)}`);
}
