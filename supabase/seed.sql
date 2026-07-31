insert into public.competitions (slug, name, description)
values (
  'vult-epl-fantasy-league',
  'Vult EPL Fantasy League',
  'The permanent Vult competition for English Premier League fantasy seasons.'
)
on conflict (slug) do nothing;

insert into public.seasons (code, name, starts_on, ends_on, status)
values ('2026-27', '2026/27', '2026-08-01', '2027-05-31', 'active')
on conflict (code) do nothing;

insert into public.competition_seasons (
  competition_id,
  season_id,
  slug,
  name,
  status,
  data_provider,
  registration_opens_at,
  registration_closes_at,
  rules_version
)
select
  competition.id,
  season.id,
  'vult-epl-fantasy-league-2026-27',
  'Vult EPL Fantasy League 2026/27',
  'draft',
  'mock',
  '2026-08-01T00:00:00Z',
  '2026-08-31T23:59:59Z',
  1
from public.competitions as competition
cross join public.seasons as season
where competition.slug = 'vult-epl-fantasy-league'
  and season.code = '2026-27'
on conflict (competition_id, season_id) do nothing;
