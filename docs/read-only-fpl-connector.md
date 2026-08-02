# Read-only Fantasy Premier League connector

## Status

The Vult Fantasy platform uses a read-only server-side connector for the public Fantasy Premier League website endpoints described by the community-maintained OpenAPI contract version `2026.27.1`.

The upstream API is unofficial and unsupported. Endpoint fields and behaviour may change without notice. The provider therefore remains isolated behind the existing provider abstraction, validation pipeline, immutable snapshots and CSV fallback.

## Enabled operations

Only public HTTP GET operations are enabled:

- `/bootstrap-static/`
- `/event-status/`
- `/entry/{entryId}/`
- `/entry/{entryId}/history/`
- `/entry/{entryId}/event/{eventId}/picks/`

The score sync currently uses bootstrap data, entry history and Gameweek picks.

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
3. An authorised administrator selects a configured Gameweek and starts a manual FPL sync.
4. The connector retrieves public entry history and Gameweek picks with no credentials.
5. Raw source data is retained in the provider snapshot and staged record.
6. Transfer cost, chip usage, points and ranks are validated.
7. Invalid or unavailable entries are stored as rejected provider records with structured errors.
8. Staged data does not affect a leaderboard until the existing score-promotion workflow is completed.

## Runtime controls

- HTTPS host allowlist: `fantasy.premierleague.com`
- request timeout: 5–120 seconds
- maximum concurrency: 5; current default: 3
- retries: up to 3 for timeouts, HTTP 429 and server errors
- no automatic scheduler is active
- response-size limit: 12 MB per upstream response
- browser execution is not permitted
- authenticated and write endpoints are disabled

## Operational fallback

When the upstream service is unavailable, rate-limited or structurally incompatible, administrators must use the existing CSV provider. Provider records remain reviewable and auditable regardless of source.
