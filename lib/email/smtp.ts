import "server-only";

import nodemailer from "nodemailer";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import vultIcon from "@/components/public/Vult_icon.png";

type RegistrationEmailEvent =
  | "registration_received"
  | "registration_awaiting_fpl_sync"
  | "registration_approved"
  | "registration_rejected"
  | "registration_suspended"
  | "registration_disqualified";

type TemplateVariables = Record<string, string>;

function normalizeLineBreaks(value: string) {
  return value.replace(/\\r\\n|\\n|\\r/g, "\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configuredAppOrigin() {
  const value =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";

  if (!value) return "";
  return `${/^https?:\/\//i.test(value) ? "" : "https://"}${value}`.replace(/\/$/, "");
}

function emailStatus(subject: string) {
  const value = subject.toLowerCase();
  if (value.includes("approved")) return { label: "Entry approved", color: "#087a55", background: "#d9f7eb" };
  if (value.includes("received")) return { label: "Registration received", color: "#125f78", background: "#dff5fb" };
  if (value.includes("suspended")) return { label: "Entry suspended", color: "#9a5b00", background: "#fff1cc" };
  if (value.includes("rejected") || value.includes("disqualified") || value.includes("not approved")) {
    return { label: "Registration update", color: "#a22727", background: "#fde5e5" };
  }
  return { label: "Vult EPL Fantasy update", color: "#125f78", background: "#dff5fb" };
}

function buildBrandedEmail(subject: string, rawBody: string) {
  const body = normalizeLineBreaks(rawBody).trim();
  const detailLabels = new Set(["Team", "Manager", "Reference", "Reason", "Eligible from"]);
  const actionLabels = new Set(["Leaderboard", "Fixtures", "Rules", "Join League", "WhatsApp Community"]);
  const details: Array<{ label: string; value: string }> = [];
  const actions: Array<{ label: string; url: string }> = [];
  const paragraphs: string[] = [];

  for (const block of body.split(/\n{2,}/)) {
    const remaining: string[] = [];
    for (const line of block.split("\n").map((value) => value.trim()).filter(Boolean)) {
      const separator = line.indexOf(":");
      const label = separator > 0 ? line.slice(0, separator).trim() : "";
      const value = separator > 0 ? line.slice(separator + 1).trim() : "";
      if (detailLabels.has(label) && value) details.push({ label, value });
      else if (actionLabels.has(label) && /^https?:\/\//i.test(value)) actions.push({ label, url: value });
      else if (line !== "Vult EPL Fantasy") remaining.push(line);
    }
    if (remaining.length) paragraphs.push(remaining.join(" "));
  }

  const status = emailStatus(subject);
  const origin = configuredAppOrigin();
  const logoUrl = origin ? `${origin}${vultIcon.src}` : "";
  const detailsHtml = details.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f3f7fb;border:1px solid #dce5f0;border-radius:16px;overflow:hidden">${details
        .map(
          ({ label, value }) =>
            `<tr><td style="padding:12px 18px;color:#64748b;font-size:13px;font-weight:700;width:110px;border-bottom:1px solid #e4ebf3">${escapeHtml(label)}</td><td style="padding:12px 18px;color:#0d163f;font-size:14px;font-weight:700;border-bottom:1px solid #e4ebf3">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const actionsHtml = actions.length
    ? `<div style="margin:26px 0 8px">${actions
        .map(
          ({ label, url }, index) =>
            `<a href="${escapeHtml(url)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 20px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:800;${label === "WhatsApp Community" ? "background:#25d366;color:#072b18" : index === 0 ? "background:#70c5df;color:#071038" : "background:#0d163f;color:#ffffff"}">${escapeHtml(label === "Leaderboard" ? "View leaderboard" : label === "Fixtures" ? "View fixtures" : label === "Join League" ? "Join Vult FPL league" : label === "WhatsApp Community" ? "Join WhatsApp community" : "Read rules")}</a>`,
        )
        .join("")}</div>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(subject)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa"><tr><td align="center" style="padding:32px 14px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e1e8f0;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(13,22,63,.08)">
      <tr><td style="padding:24px 30px;background:#0d163f">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          ${logoUrl ? `<td style="padding-right:12px"><img src="${escapeHtml(logoUrl)}" width="42" height="42" alt="Vult" style="display:block;width:42px;height:42px;object-fit:contain;border-radius:8px;background:#ffffff;padding:4px"></td>` : ""}
          <td><div style="color:#ffffff;font-size:19px;font-weight:800">Vult EPL Fantasy</div><div style="margin-top:3px;color:#9eddf0;font-size:12px;letter-spacing:1.6px;text-transform:uppercase">Play. Compete. Win.</div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:34px 30px 30px">
        <span style="display:inline-block;padding:7px 11px;border-radius:999px;background:${status.background};color:${status.color};font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase">${escapeHtml(status.label)}</span>
        <h1 style="margin:18px 0 22px;color:#0d163f;font-size:28px;line-height:1.2;letter-spacing:-.5px">${escapeHtml(subject)}</h1>
        ${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.65">${escapeHtml(paragraph)}</p>`).join("")}
        ${detailsHtml}
        ${actionsHtml}
      </td></tr>
      <tr><td style="padding:22px 30px;background:#f8fafc;border-top:1px solid #e5ebf2;color:#64748b;font-size:12px;line-height:1.6">
        This is an automated message about your Vult EPL Fantasy registration. Please keep your registration reference for future support.<br>
        <strong style="color:#0d163f">Vult EPL Fantasy</strong>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

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
  return normalizeLineBreaks(
    template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => variables[key] ?? ""),
  );
}

function appUrl(path = "") {
  return `${configuredAppOrigin()}${path}`;
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
      text: normalizeLineBreaks(notification.body),
      html: buildBrandedEmail(notification.subject ?? "Vult EPL Fantasy update", notification.body),
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
    .select("id, public_reference, participant_id, competition_season_id, status, eligible_from_round, metadata")
    .eq("id", registrationId)
    .single();
  if (registrationError || !registration) throw new Error(registrationError?.message ?? "Registration not found.");

  const [{ data: participant }, { data: season }, { data: verification }, { data: template }] = await Promise.all([
    db.from("participants").select("full_name, email").eq("id", registration.participant_id).single(),
    db.from("competition_seasons").select("name, settings").eq("id", registration.competition_season_id).single(),
    db.from("registration_verifications").select("fpl_team_name, fpl_manager_name").eq("registration_id", registration.id).maybeSingle(),
    db.from("notification_templates").select("id, subject_template, body_template").eq("event_key", event).eq("status", "active").maybeSingle(),
  ]);

  const email = String(participant?.email ?? "").trim();
  if (!email) return null;
  if (!template) throw new Error(`The ${event} email template is not active.`);

  const seasonSettings = season?.settings && typeof season.settings === "object" && !Array.isArray(season.settings)
    ? season.settings as Record<string, unknown>
    : {};
  const leagueCode = String(seasonSettings.fpl_league_code ?? "").trim();
  const variables: TemplateVariables = {
    participant_name: String(participant.full_name ?? "Participant"),
    registration_reference: String(registration.public_reference ?? ""),
    fpl_team_name: String(verification?.fpl_team_name ?? ""),
    fpl_manager_name: String(verification?.fpl_manager_name ?? ""),
    season_name: String(season?.name ?? "Vult EPL Fantasy"),
    registration_status: String(registration.status ?? ""),
    reason: options.reason?.trim() || "Contact Vult support if you require more information.",
    eligible_from_gameweek: String(registration.eligible_from_round ?? "the next open Gameweek"),
    league_join_url: leagueCode
      ? `https://fantasy.premierleague.com/leagues/auto-join/${encodeURIComponent(leagueCode)}`
      : appUrl("/register"),
    leaderboard_url: appUrl("/leaderboards"),
    fixtures_url: appUrl("/fixtures"),
    rules_url: appUrl("/rules"),
    whatsapp_community_url: "https://chat.whatsapp.com/IFvVnASstyA81vXpl1ahsy?s=cl&p=i&mlu=4",
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
