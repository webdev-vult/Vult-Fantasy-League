# Vult Fantasy Platform

A reusable, multi-season competition platform for Vult fantasy leagues.

The first configured competition will be the **Vult EPL Fantasy League 2026/27**, but the architecture is designed to retain participant history, rules, leaderboards, winners and prize payments across future seasons.

## Technology

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, Storage and Edge Functions
- Vercel hosting and preview deployments
- GitHub pull-request workflow

## Current foundation

- Responsive platform landing page
- Deployment health endpoint at `/api/health`
- Browser and server Supabase client utilities
- Multi-season TypeScript domain models
- Initial secure-by-default Supabase migration
- Development seed for the 2026/27 competition

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

4. Add the development Supabase URL and publishable key.
5. Start the application:

   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Privileged administrative jobs |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Application base URL |
| `CRON_SECRET` | Server only | Scheduled job authentication |
| `FANTASY_DATA_PROVIDER` | Server | `mock`, `csv`, `approved_fpl` or `licensed` |
| `FANTASY_DATA_BASE_URL` | Server | Approved provider base URL |
| `FANTASY_DATA_API_KEY` | Server only | Approved provider credential |
| `FPL_LEAGUE_ID` | Server | Season-specific league identifier |

Never expose the service-role key or provider API key in a `NEXT_PUBLIC_` variable.

## Database workflow

Schema changes are stored in `supabase/migrations`. The first migration creates permanent competitions, seasons, season configurations, participants, registrations, fantasy entries, rounds, scores, prizes, winners, payments, administrators and audit logs.

Apply migrations to a development Supabase project before production. Do not run development seed data against production.

## Development workflow

1. Create a feature branch.
2. Implement one coherent feature.
3. Run `npm run lint`, `npm run typecheck` and `npm run build`.
4. Open a pull request.
5. Review the Vercel preview deployment.
6. Merge to `main` only after verification.

## Planned implementation order

1. Foundation and environment verification
2. Authentication and admin roles
3. Competition and season management
4. Participant registration and verification
5. Score import and leaderboards
6. Winner approval and prize payments
7. Approved fantasy data integration
8. Reports, notifications and yearly rollover
