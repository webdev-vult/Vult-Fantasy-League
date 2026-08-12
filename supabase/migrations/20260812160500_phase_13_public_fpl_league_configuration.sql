update public.competition_seasons
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'fpl_league_code', 'ura0oj',
  'fpl_league_name', 'Vult EPL Fantasy League 26/27'
)
where slug = 'vult-epl-fantasy-league-2026-27'
  and external_league_id = '538121';

comment on column public.competition_seasons.settings
is 'Season-specific configuration. Phase 13 stores public FPL league display identity here so public pages do not hardcode a season league name or join code.';
