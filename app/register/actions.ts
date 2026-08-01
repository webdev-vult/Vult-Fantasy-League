"use server";

import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type RegistrationState = {
  error: string | null;
};

const SAFE_MESSAGES = [
  "Registration is not currently open.",
  "Registration is not currently available.",
  "You must accept the competition rules and privacy notice.",
  "Enter your full legal name.",
  "Enter a valid date of birth.",
  "You do not meet the minimum age requirement.",
  "Enter a valid phone number.",
  "Enter a valid email address.",
  "Your country is not eligible for this competition.",
  "A Vult account reference is required.",
  "Enter a valid numeric FPL Entry ID.",
  "This phone number is already linked to a participant. Contact support to register for another season.",
  "You are already registered for this competition season.",
  "A participant, Vult account, email address, or FPL Entry ID in this registration is already in use.",
  "Unable to submit this registration.",
];

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeErrorMessage(message: string) {
  return SAFE_MESSAGES.find((safeMessage) => message.includes(safeMessage)) ??
    "We could not submit your registration. Review your details and try again.";
}

export async function submitRegistrationAction(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const competitionSlug = value(formData, "competition_slug");
  const dateOfBirth = value(formData, "date_of_birth");

  if (!competitionSlug || !dateOfBirth) {
    return { error: "Complete all required registration fields." };
  }

  let data: any;

  try {
    const db = createAdminSupabaseClient() as any;
    const response = await db.rpc("submit_public_registration", {
      p_competition_season_slug: competitionSlug,
      p_full_name: value(formData, "full_name"),
      p_date_of_birth: dateOfBirth,
      p_phone: value(formData, "phone"),
      p_whatsapp_phone: value(formData, "whatsapp_phone"),
      p_email: value(formData, "email"),
      p_city: value(formData, "city"),
      p_country: value(formData, "country"),
      p_vult_customer_ref: value(formData, "vult_customer_ref"),
      p_fpl_entry_id: value(formData, "fpl_entry_id"),
      p_fpl_team_name: value(formData, "fpl_team_name"),
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
