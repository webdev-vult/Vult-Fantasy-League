-- Ensure every successful registration email includes the WhatsApp community.
update public.notification_templates
set body_template =
  'Hello {{participant_name}},\n\nYour registration for {{season_name}} has been received.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nYour entry is awaiting review. We will email you when it is approved or if more information is required.\n\nJoin League: {{league_join_url}}\nWhatsApp Community: {{whatsapp_community_url}}\n\nJoin the WhatsApp community for Gameweek reminders, score notices and competition announcements. Official registration and approval decisions will still be sent by email.\n\nVult EPL Fantasy',
    updated_at = now()
where event_key = 'registration_received';
