# Read-only Fantasy Premier League connector

## Status

The Vult Fantasy platform uses a read-only server-side connector for the public Fantasy Premier League website endpoints described by the community-maintained OpenAPI contract version `2026.27.1`.

The upstream API is unofficial and unsupported. Endpoint fields and behaviour may change without notice. The provider therefore remains isolated behind the existing provider abstraction, validation pipeline, immutable snapshots and CSV fallback.

## Official Vult mini-league

- Name: `Vult EPL Fantasy League 26/27`
- Numeric league ID: `538121`
- Join code: `ura0oj`
- Standings page: `https://fantasy.premierleague.com/en/leagues/538121/standings/c`
- Auto-join page: `https://fantasy.premierleague.com/leagues/auto-join/ura0oj`

A participant must appear in league `538121` before a provider score can be accepted. The league standings response is used for membership and reconciliation only. Official Gameweek scoring continues to come from the participant entry history and picks endpoints.

## Enabled operations

Only public HTTP GET operations are enabled:

- `/bootstrap-static/`
- `/event-status/`
- `/entry/{entryId}/`
- `/entry/{entryId}/history/`
- `/entry/{entryId}/event/{eventId}/picks/`
- `/leagues-classic/{leagueId}/standings/`

The score sync uses bootstrap data, paginated classic-league standings, entry history and Gameweek picks.

## Prohibited operations

The platform must not:

- collect or store an FPL password;
- collect or store an FPL browser session cookie;
- use `/me/`;
- use authenticated `/my-team/{entryId}/` operations;
- submit transfers;
- change squads, captaincy or chips;
- proxy arbitrary URLs;
- expose the upstream API directly to public browsers.

## Data workflow

1. A participant supplies an FPL Entry ID during registration.
2. Compliance and Competition administrators verify the registration.
3. The platform confirms that the Entry ID appears in official league `538121`.
4. An authorised administrator selects a configured Gameweek and starts a manual FPL sync.
5. The connector retrieves public league standings, entry history and Gameweek picks with no credentials.
6. Raw source data is retained in the provider snapshot and staged record.
7. League membership, transfer cost, chip usage, points and ranks are validated.
8. Entries outside the official league, invalid entries and unavailable records are stored as rejected provider records with structured errors.
9. Staged data does not affect a leaderboard until the existing score-promotion workflow is completed.

## Runtime controls

- HTTPS host allowlist: `fantasy.premierleague.com`
- request timeout: 5–120 seconds
- maximum concurrency: 5; current default: 3
- retries: up to 3 for timeouts, HTTP 429 and server errors
- league pagination: `page_standings` and `page_new_entries`
- league page safety limit: 500 pages per collection
- no automatic scheduler is active
- response-size limit: 12 MB per upstream response
- browser execution is not permitted
- authenticated and write endpoints are disabled

## Operational fallback

When the upstream service is unavailable, rate-limited or structurally incompatible, administrators must use the existing CSV provider. Provider records remain reviewable and auditable regardless of source.
