update public.notification_templates
set body_template = case event_key
  when 'registration_received' then
    'Hello {{participant_name}},\n\nYour registration for {{season_name}} has been received.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nYour entry is awaiting review. We will email you when it is approved or if more information is required.\n\nJoin League: {{league_join_url}}\nWhatsApp Community: {{whatsapp_community_url}}\n\nJoin the WhatsApp community for Gameweek reminders, score notices and competition announcements. Official registration and approval decisions will still be sent by email.\n\nVult EPL Fantasy'
  when 'registration_awaiting_fpl_sync' then
    'Hello {{participant_name}},\n\nYour registration for {{season_name}} has been safely received.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\nEligible from: Gameweek {{eligible_from_gameweek}}\n\nFPL has not published your league entry yet. Vult will keep checking automatically. Completed Gameweeks will not count, and you will be eligible from the Gameweek shown above once your league membership is verified.\n\nJoin League: {{league_join_url}}\nWhatsApp Community: {{whatsapp_community_url}}\n\nJoin the WhatsApp community for Gameweek reminders, score notices and competition announcements. Official registration and approval decisions will still be sent by email.\n\nVult EPL Fantasy'
  when 'registration_approved' then
    'Hello {{participant_name}},\n\nYour entry into {{season_name}} has been approved.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nLeaderboard: {{leaderboard_url}}\nFixtures: {{fixtures_url}}\nWhatsApp Community: {{whatsapp_community_url}}\n\nJoin the WhatsApp community for Gameweek reminders, score notices and competition announcements. Official decisions will still be sent by email and shown on the platform.\n\nIf you are selected as a weekly, monthly or overall winner, Vult KYC Level 1 must be confirmed before the prize can be awarded.\n\nVult EPL Fantasy'
  else body_template
end,
updated_at = now()
where event_key in ('registration_received', 'registration_awaiting_fpl_sync', 'registration_approved');
