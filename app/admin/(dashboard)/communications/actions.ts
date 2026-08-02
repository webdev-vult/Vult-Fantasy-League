"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const CONTENT_ROLES = ["super_admin", "content_manager"] as const;
const DELIVERY_ROLES = ["super_admin", "content_manager", "support_officer"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function required(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function dateTime(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${key.replaceAll("_", " ")} is invalid.`);
  return parsed.toISOString();
}

function communicationUrl(type: "success" | "error", message: string, tab?: string, edit?: string) {
  const params = new URLSearchParams({ [type]: message });
  if (tab) params.set("tab", tab);
  if (edit) params.set("edit", edit);
  return `/admin/communications?${params.toString()}`;
}

function refreshCommunications() {
  revalidatePath("/admin");
  revalidatePath("/admin/communications");
  revalidatePath("/announcements");
}

export async function saveAnnouncementAction(formData: FormData) {
  const admin = await requireAdminRole(CONTENT_ROLES);
  let announcementId = text(formData, "announcement_id");

  try {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db.rpc("save_announcement", {
      p_announcement_id: announcementId || null,
      p_competition_season_id: text(formData, "competition_season_id") || null,
      p_slug: required(formData, "slug", "Slug"),
      p_title: required(formData, "title", "Title"),
      p_summary: text(formData, "summary") || null,
      p_body: required(formData, "body", "Body"),
      p_category: required(formData, "category", "Category"),
      p_audience: required(formData, "audience", "Audience"),
      p_is_pinned: formData.get("is_pinned") === "on",
      p_publish_at: dateTime(formData, "publish_at"),
      p_expires_at: dateTime(formData, "expires_at"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
    announcementId = String(data ?? announcementId);
  } catch (error) {
    redirect(communicationUrl("error", error instanceof Error ? error.message : "Unable to save announcement.", "announcements", announcementId));
  }

  refreshCommunications();
  redirect(communicationUrl("success", "Announcement saved successfully.", "announcements", announcementId));
}

export async function changeAnnouncementStatusAction(formData: FormData) {
  const admin = await requireAdminRole(CONTENT_ROLES);
  const announcementId = required(formData, "announcement_id", "Announcement");
  const action = required(formData, "action", "Action");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("change_announcement_status", {
      p_announcement_id: announcementId,
      p_action: action,
      p_publish_at: dateTime(formData, "publish_at"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(communicationUrl("error", error instanceof Error ? error.message : "Unable to update announcement.", "announcements", announcementId));
  }

  refreshCommunications();
  redirect(communicationUrl("success", `Announcement ${action} action completed.`, "announcements", announcementId));
}

export async function saveNotificationTemplateAction(formData: FormData) {
  const admin = await requireAdminRole(CONTENT_ROLES);
  const templateId = text(formData, "template_id");
  const channels = formData.getAll("channels").map((value) => String(value));

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("save_notification_template", {
      p_template_id: templateId || null,
      p_event_key: required(formData, "event_key", "Event key"),
      p_name: required(formData, "name", "Name"),
      p_description: text(formData, "description") || null,
      p_subject_template: text(formData, "subject_template") || null,
      p_body_template: required(formData, "body_template", "Body template"),
      p_default_channels: channels,
      p_status: required(formData, "status", "Status"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(communicationUrl("error", error instanceof Error ? error.message : "Unable to save notification template.", "templates", templateId));
  }

  refreshCommunications();
  redirect(communicationUrl("success", "Notification template saved.", "templates", templateId));
}

export async function queueNotificationAction(formData: FormData) {
  const admin = await requireAdminRole(DELIVERY_ROLES);

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("queue_admin_notification", {
      p_competition_season_id: text(formData, "competition_season_id") || null,
      p_registration_id: text(formData, "registration_id") || null,
      p_dispute_id: text(formData, "dispute_id") || null,
      p_channel: required(formData, "channel", "Channel"),
      p_recipient: required(formData, "recipient", "Recipient"),
      p_subject: text(formData, "subject") || null,
      p_body: required(formData, "body", "Message body"),
      p_scheduled_at: dateTime(formData, "scheduled_at"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(communicationUrl("error", error instanceof Error ? error.message : "Unable to queue notification.", "outbox"));
  }

  refreshCommunications();
  redirect(communicationUrl("success", "Notification added to the delivery queue.", "outbox"));
}

export async function recordNotificationDeliveryAction(formData: FormData) {
  const admin = await requireAdminRole(DELIVERY_ROLES);

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("record_notification_delivery", {
      p_notification_id: required(formData, "notification_id", "Notification"),
      p_outcome: required(formData, "outcome", "Outcome"),
      p_delivery_method: required(formData, "delivery_method", "Delivery method"),
      p_provider_message_id: text(formData, "provider_message_id") || null,
      p_failure_reason: text(formData, "failure_reason") || null,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(communicationUrl("error", error instanceof Error ? error.message : "Unable to record delivery.", "outbox"));
  }

  refreshCommunications();
  redirect(communicationUrl("success", "Delivery result recorded.", "outbox"));
}
