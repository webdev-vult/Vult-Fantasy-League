"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const FINANCE_ROLES = ["super_admin", "finance_officer"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function paymentUrl(
  paymentId: string,
  type: "success" | "error",
  message: string,
) {
  const params = new URLSearchParams({ [type]: message });
  return `/admin/payments/${paymentId}?${params.toString()}`;
}

function redirectWithMessage(
  paymentId: string,
  type: "success" | "error",
  message: string,
): never {
  redirect(paymentUrl(paymentId, type, message));
}

export async function recordManualVultPaymentAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");

  try {
    const creditedAtInput = text(formData, "credited_at");
    let creditedAt: string | null = null;

    if (creditedAtInput) {
      const parsed = new Date(creditedAtInput);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("The Vult credit date and time is invalid.");
      }
      creditedAt = parsed.toISOString();
    }

    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("record_manual_prize_payment", {
      p_payment_id: paymentId,
      p_transaction_reference: requiredText(
        formData,
        "transaction_reference",
        "Vult transaction reference",
      ),
      p_evidence_path: text(formData, "evidence_path") || null,
      p_credited_at: creditedAt,
      p_notes: requiredText(formData, "notes", "Payment confirmation notes"),
      p_requested_by: admin.id,
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      paymentId,
      "error",
      error instanceof Error
        ? error.message
        : "Unable to record the manual Vult payment.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${paymentId}`);
  redirectWithMessage(
    paymentId,
    "success",
    "The confirmed Vult account credit has been recorded successfully.",
  );
}
