import "server-only";

import nodemailer from "nodemailer";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type RegistrationEmailEvent =
  | "registration_received"
  | "registration_approved"
  | "registration_rejected"
  | "registration_suspended"
  | "registration_disqualified";

type TemplateVariables = Record<string, string>;

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? user;

  if (!host || !user || !pass || !fromAddress) {
    throw new Error("Gmail SMTP is not configured. Add the SMTP environment variables in Vercel.");
  }

  const port = Number.parseInt(process.env.SMTP_PORT ?? "465", 10);
  if (!Number.isInteger(port)) throw new Error("SMTP_PORT must be a valid number.");

  return {
    host,
    port,
    secure: (process.env.SMTP_SECURE ?? String(port === 465)) === "true",
    user,
    pass,
    fromAddress,
    fromName: process.env.EMAIL_FROM_NAME ?? "Vult EPL Fantasy",
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  };
}

function render(template: string, variables: TemplateVariables) {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => variables[key] ?? "");
}

function appUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_APP_PASSWORD &&
      (process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER),
  );
}

export async function verifySmtpConnection() {
  const config = smtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  await transport.verify();
}

export async function deliverQueuedEmail(notificationId: string, attemptedBy: string | null = null) {
  // The generated database types are updated after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  const { data: notification, error } = await db
    .from("notification_outbox")
    .select("id, channel, recipient, subject, body, status, scheduled_at")
    .eq("id", notificationId)
    .single();

  if (error || !notification) throw new Error(error?.message ?? "Email notification was not found.");
  if (notification.channel !== "email") throw new Error("Only email notifications can be sent through Gmail SMTP.");
  if (["sent", "cancelled", "skipped"].includes(notification.status)) {
    throw new Error("This email notification is already final.");
  }
  if (new Date(notification.scheduled_at).getTime() > Date.now()) {
    throw new Error("This email is scheduled for a future time.");
  }

  const config = smtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  let result;
  try {
    result = await transport.sendMail({
      from: { name: config.fromName, address: config.fromAddress },
      replyTo: config.replyTo,
      to: notification.recipient,
      subject: notification.subject ?? "Vult EPL Fantasy update",
      text: notification.body,
    });

  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : "Gmail SMTP delivery failed.";
    await db.rpc("record_provider_notification_delivery", {
      p_notification_id: notification.id,
      p_outcome: "failed",
      p_provider_message_id: null,
      p_failure_reason: reason.slice(0, 2000),
      p_requested_by: attemptedBy,
    });
    throw sendError;
  }

  const { error: recordError } = await db.rpc("record_provider_notification_delivery", {
    p_notification_id: notification.id,
    p_outcome: "sent",
    p_provider_message_id: result.messageId,
    p_failure_reason: null,
    p_requested_by: attemptedBy,
  });
  if (recordError) throw new Error(`Email was accepted by Gmail but delivery logging failed: ${recordError.message}`);
  return result.messageId;
}

export async function queueRegistrationEmail(
  registrationId: string,
  event: RegistrationEmailEvent,
  options: { reason?: string | null; createdBy?: string | null } = {},
) {
  // The generated database types are updated after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  const { data: registration, error: registrationError } = await db
    .from("registrations")
    .select("id, public_reference, participant_id, competition_season_id, fpl_team_name, fpl_manager_name, status")
    .eq("id", registrationId)
    .single();
  if (registrationError || !registration) throw new Error(registrationError?.message ?? "Registration not found.");

  const [{ data: participant }, { data: season }, { data: template }] = await Promise.all([
    db.from("participants").select("full_name, email").eq("id", registration.participant_id).single(),
    db.from("competition_seasons").select("name").eq("id", registration.competition_season_id).single(),
    db.from("notification_templates").select("id, subject_template, body_template").eq("event_key", event).eq("status", "active").maybeSingle(),
  ]);

  const email = String(participant?.email ?? "").trim();
  if (!email) return null;
  if (!template) throw new Error(`The ${event} email template is not active.`);

  const variables: TemplateVariables = {
    participant_name: String(participant.full_name ?? "Participant"),
    registration_reference: String(registration.public_reference ?? ""),
    fpl_team_name: String(registration.fpl_team_name ?? ""),
    fpl_manager_name: String(registration.fpl_manager_name ?? ""),
    season_name: String(season?.name ?? "Vult EPL Fantasy"),
    registration_status: String(registration.status ?? ""),
    reason: options.reason?.trim() || "Contact Vult support if you require more information.",
    leaderboard_url: appUrl("/leaderboards"),
    fixtures_url: appUrl("/fixtures"),
    rules_url: appUrl("/rules"),
  };
  const idempotencyKey = `registration:${registration.id}:${event}:email`;
  const { data: queued, error: queueError } = await db
    .from("notification_outbox")
    .upsert(
      {
        competition_season_id: registration.competition_season_id,
        participant_id: registration.participant_id,
        registration_id: registration.id,
        template_id: template.id,
        channel: "email",
        recipient: email,
        subject: render(template.subject_template ?? "Vult EPL Fantasy update", variables),
        body: render(template.body_template, variables),
        status: "queued",
        scheduled_at: new Date().toISOString(),
        idempotency_key: idempotencyKey,
        created_by: options.createdBy ?? null,
        metadata: { event, delivery_provider: "gmail_smtp" },
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id, status")
    .maybeSingle();
  if (queueError) throw new Error(queueError.message);
  if (!queued || queued.status === "sent") return queued?.id ?? null;

  await deliverQueuedEmail(queued.id, options.createdBy ?? null);
  return queued.id;
}
