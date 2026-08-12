# Read-only Fantasy Premier League connector

## Status

The Vult Fantasy Platform uses server-side, read-only access to the public Fantasy Premier League service. FPL access is isolated behind provider and helper modules so registration matching, public fixtures and score retrieval never require participant FPL passwords, browser sessions or write access.

FPL response fields and availability can change, so provider data must remain validated and auditable. The CSV provider remains the operational fallback when live FPL retrieval is unavailable or incompatible.

## Season configuration

FPL league identity is season-specific configuration rather than a permanent source-code constant.

For the current configured season, the competition-season record contains the numeric FPL league ID. Public display configuration may also include the season league name and join code in `competition_seasons.settings`.

A future season should update its own league configuration without changing the permanent competition or historical seasons.

## Approved read-only operations

The platform currently uses or is designed to use public HTTP GET operations for:

- `/bootstrap-static/`
- `/event-status/`
- `/fixtures/?event={eventId}`
- `/entry/{entryId}/`
- `/entry/{entryId}/history/`
- `/entry/{entryId}/event/{eventId}/picks/`
- `/leagues-classic/{leagueId}/standings/`

The classic-league response is used to resolve registration identities and confirm league membership. Entry history and Gameweek picks are used for participant score records, transfer costs and chip information. Bootstrap and fixture data are used for Gameweek discovery, deadlines and public fixture display.

## Registration identity workflow

1. A participant creates an official FPL team and joins the configured Vult FPL mini-league.
2. The participant submits the exact Team name and Manager name shown in the Vult league.
3. The server retrieves the configured league roster using public read-only league data.
4. Both names are normalized and matched together.
5. A unique match is resolved to the numeric FPL Entry ID.
6. The numeric Entry ID, Team name and Manager name are stored for that competition season.
7. The participant does not need to discover or manually enter the Entry ID.

The numeric Entry ID remains the persistent fantasy-team identifier even if the visible FPL team name later changes.

## Score data workflow

1. An approved registration has a verified FPL Entry ID.
2. An authorized competition workflow selects the configured Gameweek.
3. The read-only provider retrieves the required public league and entry data.
4. Raw source data is retained in provider snapshots and normalized staging records.
5. League membership, transfer cost, chip usage, points and ranks are validated.
6. Invalid or unavailable records are retained with structured provider errors rather than silently discarded.
7. Staged data does not affect a leaderboard until the controlled score-promotion workflow runs.
8. Finalisation and leaderboard publication remain separate controlled operations.
9. Winner generation remains separate from score retrieval and requires human review.

## Public Gameweek and fixture workflow

The public site discovers the current or next Gameweek from FPL bootstrap data rather than hardcoding Gameweek 1. It then retrieves that event's public fixtures and deadline. If FPL is unavailable, the public site returns a safe unavailable state instead of inventing current fixture or deadline data.

## Runtime controls

- HTTPS host allowlist: `fantasy.premierleague.com`
- server-only execution
- public HTTP `GET` only
- no browser cookies or FPL credentials
- request timeouts
- up to three retries for eligible transient failures
- response-size limit: 12 MB
- league pagination for standings and new entries
- league page safety limit: 500 pages
- controlled concurrency in score synchronization
- raw snapshot and structured error retention
- no active automatic score scheduler until the Phase 13 scheduling policy is approved and tested

The Phase 13 shared FPL HTTP client centralizes host validation, timeout, retry and response-size protections for registration identity and public fixtures. The main score provider must retain the same security properties as the shared client is consolidated further.

## Prohibited operations

The platform must not:

- collect or store an FPL password;
- collect or store an FPL browser session cookie;
- use authenticated personal-account endpoints;
- submit transfers;
- change squads, captaincy or chips;
- proxy arbitrary upstream URLs;
- expose privileged provider operations directly to public browsers;
- treat an unvalidated upstream response as a final Vult leaderboard result.

## Operational fallback

When the live FPL service is unavailable, rate-limited or structurally incompatible, authorized administrators can use the existing CSV provider and follow the same staging, validation, scoring and audit controls. Provider records remain reviewable regardless of source.
