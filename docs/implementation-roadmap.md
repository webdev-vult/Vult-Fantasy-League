# Vult Fantasy Platform Implementation Roadmap

This document is the permanent delivery tracker for the Vult Fantasy Competition Platform. Every branch and pull request should reference a phase from this roadmap.

## Status key

- **Pending** — not started
- **In Progress** — currently being implemented
- **In Review** — pull request or user acceptance review
- **Completed** — merged and verified
- **Ongoing** — continues alongside development

## Delivery phases

| Phase | Module | Status |
|---|---|---|
| 0 | Research, rules and governance | Ongoing |
| 1 | Platform foundation | Completed |
| 2 | Admin authentication and security | Completed |
| 3 | Competition and season management | Completed |
| 4 | Competition operations configuration | Completed |
| 5 | Public website and participant registration | Completed |
| 6 | Participant verification and management | Completed |
| 7 | Fantasy data-provider integration | In Review |
| 8 | Scores and leaderboards | Pending |
| 9 | Winner calculation and approval | Pending |
| 10 | Prize and payment management | Pending |
| 11 | Notifications, announcements and disputes | Pending |
| 12 | Reports, analytics and audit | Pending |
| 13 | Testing, launch and annual rollover | Pending |
| 14 | Advanced and future features | Pending |

## Phase 0 — Research, rules and governance

Define eligibility, age limits, Vult-account requirements, employee eligibility, prize policy, chip treatment, transfer deductions, tie-breakers, dispute windows, privacy wording, consent, and approved data usage.

## Phase 1 — Platform foundation

Next.js, TypeScript, Supabase, Vercel, GitHub workflow, multi-season schema, RLS, generated database types, health checks, and the initial platform shell.

## Phase 2 — Admin authentication and security

Supabase authentication, protected admin routes, session refresh, seven admin roles, role-based RLS, Super Admin bootstrap, and secure sign-out.

## Phase 3 — Competition and season management

Permanent competitions, reusable seasons, competition-season links, lifecycle status, registration dates, provider selection, external league ID, rules version, and audit logging.

## Phase 4 — Competition operations configuration

- Create and manage rounds/Gameweeks
- Bulk-create standard EPL Gameweeks
- Set deadlines, current round, finalisation, and locking status
- Create monthly prize periods from round ranges
- Create and publish versioned competition rules
- Configure weekly, monthly, overall, and special prize categories
- Record all changes in audit logs

## Phase 5 — Public website and participant registration

Public competition pages, rules, prizes, registration form, seasonal registration, Vult details, FPL Entry ID capture, consent records, and registration-window enforcement.

## Phase 6 — Participant verification and management

Admin participant list, duplicate detection, FPL verification, Vult verification, approval, rejection, suspension, disqualification, notes, status history, and exports.

## Phase 7 — Fantasy data-provider integration

Mock and CSV provider adapters, replaceable provider contracts, immutable raw snapshots, normalized staging records, validation, idempotency, retry lineage, structured integration errors, provider settings, and execution history. Approved FPL or licensed network connectors remain disabled until written data approval and credentials are available. Phase 7 does not publish leaderboard scores; Phase 8 promotes reviewed staging records into scoring.

## Phase 8 — Scores and leaderboards

Provisional and final round scores, monthly aggregation, overall standings, score history, transfer deductions, chip data, corrections, locking, public leaderboards, search, and filters.

## Phase 9 — Winner calculation and approval

Eligibility engine, chip rules, tie-breakers, weekly/monthly/overall winner candidates, competition review, compliance approval, rejection, confirmation, and publication readiness.

## Phase 10 — Prize and payment management

Prize assignment, Vult-account confirmation, finance approval, payment processing, transaction references, evidence, failures, reversals, and payment reports.

## Phase 11 — Notifications, announcements and disputes

Email, WhatsApp, in-platform notifications, announcements, participant disputes, evidence, assignment, escalation, decisions, and communication history.

## Phase 12 — Reports, analytics and audit

Operational reports, management analytics, season comparison, participant retention, prize spending, exports, and searchable audit history.

## Phase 13 — Testing, launch and annual rollover

Security testing, role testing, scoring tests, mobile checks, performance, backups, user acceptance testing, launch preparation, season closure, archiving, Hall of Fame, and next-season creation.

## Phase 14 — Advanced features

Mobile app, automated wallet payouts, social graphics, certificates, referrals, sponsor modules, AI insights, prediction games, and additional competitions.

## Branch naming

Use phase-based branch names:

```text
agent/phase-4-competition-operations
agent/phase-5-participant-registration
agent/phase-6-participant-verification
agent/phase-7-fantasy-provider
```

## Completion rule

A phase is only marked **Completed** after:

1. Code review is complete.
2. Vercel production build passes.
3. Required Supabase migrations are applied.
4. Security checks pass.
5. The feature is manually verified.
6. The pull request is merged into `main`.
