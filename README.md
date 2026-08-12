# Vult Fantasy Platform

A reusable, multi-season competition platform for Vult fantasy leagues.

The platform is currently configured for the Vult EPL Fantasy League, while competition seasons, rules, registrations, score history, leaderboards, winners, payments, disputes and audit records are retained independently so future seasons can be operated without replacing historical data.

## Technology

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL and Auth
- Vercel hosting and preview deployments
- GitHub pull-request workflow

## Current platform scope

- Permanent competition and multi-season management
- Versioned competition rules and prize configuration
- Public registration using exact FPL Team and Manager names
- Server-side resolution and storage of the numeric FPL Entry ID
- Participant, FPL, duplicate-risk and Vult-account verification workflows
- Read-only mock, CSV and approved FPL provider architecture
- Gameweek, monthly and overall scoring and leaderboards
- Controlled winner generation, competition review and Compliance review
- Manual Vult prize-settlement recording with transaction evidence and audit history
- Announcements, notifications and participant disputes
- Management reports, CSV exports and searchable audit history
- Row Level Security and role-based administrator access
- Public health endpoint at `/api/health`

## Registration model

Participants do not need to discover or enter their numeric FPL Entry ID. The current public flow is:

1. Create an official FPL team.
2. Join the configured Vult FPL mini-league.
3. Enter the exact Team name and Manager name shown in that league.
4. Submit the required contact information and declarations.
5. The server resolves the matching numeric FPL Entry ID and stores it as the permanent fantasy-team identifier for that competition season.

Date of birth is not required during normal public registration. The participant confirms the published minimum-age requirement. Additional age evidence may be reviewed later when required for Compliance or winner verification.

## FPL integration policy

FPL access is read-only. Server-side requests are restricted to the official `fantasy.premierleague.com` host, use timeouts and retry controls, and do not send browser cookies or credentials.

The numeric FPL league ID is stored on the competition-season record. Public league display information such as the join code and league name is season configuration, not a source-code constant.

Score retrieval and public fixture retrieval must remain read-only. Final leaderboard publication, winner approval and prize settlement remain controlled Vult workflows.

## Prize-payment policy

The fantasy platform does **not** initiate Vult payouts or reversals through a payment API.

The intended operational flow is:

1. Confirm the winner through competition and Compliance review.
2. Verify the required Vult destination.
3. Finance credits the winner manually in the main Vult system.
4. An authorized administrator records the verified transaction reference, credit time and supporting evidence in the fantasy platform.
5. The fantasy platform retains the settlement and audit record.

## Local setup

1. Install Node.js 22 or later.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

4. Add development Supabase credentials.
5. Start the application:

   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Privileged server workflows; never expose to the browser |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Application base URL where required by application links |
| `PRIMARY_COMPETITION_SLUG` | Server | Optional permanent competition selector; defaults to `vult-epl-fantasy-league` |
| `FPL_BASE_URL` | Server | Optional FPL base URL override; code restricts it to the official FPL host |

The FPL league ID and join code are competition-season configuration and are not environment secrets.

## Database workflow

Schema changes are stored in `supabase/migrations` and should be reviewed before they are applied. Historical migrations are retained; do not rewrite old production migration history simply to make the folder shorter.

Use development or controlled preview validation for schema changes where possible. Never run development seed data against production.

## Development workflow

1. Create a phase or task branch from `main`.
2. Implement one coherent change.
3. Run `npm run lint`, `npm run typecheck` and `npm run build`.
4. Review the Vercel preview deployment and relevant Supabase migration changes.
5. Open a pull request.
6. Merge to `main` only after review and production-readiness checks.

## Current delivery phase

**Phase 13 – Launch Hardening & Cleanup** is focused on making the existing platform internally consistent and launch-ready rather than adding unrelated features. The active roadmap is maintained in `docs/implementation-roadmap.md`.
