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
| 7 | Fantasy data-provider integration | Completed |
| 8 | Scores and leaderboards | Completed |
| 9 | Winner calculation and approval | Completed |
| 10 | Prize and payment management | Completed |
| 11 | Notifications, announcements and disputes | In Review |
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

Validated provider-score promotion, provisional and final Gameweek scores, transfer deductions, chip-based weekly eligibility, point-based rankings that preserve ties for Phase 9 review, monthly aggregation, overall standings, correction history, finalisation, versioned privacy-safe publication snapshots, public search, filters, and pagination.

## Phase 9 — Winner calculation and approval

- Generate weekly, monthly and overall candidates from final standings
- Evaluate registration, participant, FPL, Vult-account, age, country, employee, duplicate, chip and repeat-winner eligibility
- Store immutable eligibility checks and every evaluated entry
- Apply versioned tie-breakers without changing public tied leaderboard ranks
- Separate competition review from independent compliance review
- Require Super Admin confirmation after both approval stages
- Reject candidates with documented reasons and generate the next eligible replacement
- Preserve replacement lineage and status history
- Block public naming when winner-publicity consent is not recorded
- Mark confirmed winners as ready for Phase 10 without creating payment records

## Phase 10 — Prize and payment management

- Prepare one controlled settlement obligation per confirmed winner
- Snapshot winner, prize, amount, currency, payment method and deadline
- Require a verified Vult destination for every cash or mixed prize
- Separate Compliance Vult-account verification from Finance approval
- Require Finance to credit the winner manually in the main Vult system
- Record the transaction only after the credit is visible on the winner account
- Capture the Vult transaction reference, credited account, credit time, evidence and notes
- Never initiate a payment, reimbursement or reversal through a Vult API
- Retain immutable settlement, reconciliation and external-correction audit records
- Cancel unpaid settlements and require Super Admin authority to reopen them
- Export season payment reports without exposing browser write access
- Keep the fantasy platform as an approval and audit ledger, not a money-movement system

## Phase 11 — Notifications, announcements and disputes

- Publish public, participant and administrator announcements
- Support draft, scheduled, published and archived announcement states
- Apply publication dates, expiry dates, pinned status and audience controls
- Maintain editable notification templates and channel preferences
- Queue email, WhatsApp, in-platform and manual communications
- Treat email and WhatsApp as manual delivery records until an approved provider is configured
- Record successful, failed, cancelled and skipped delivery attempts
- Let participants submit disputes using their registration reference and registered contact
- Issue short-lived case-access tokens without exposing participant records
- Let participants view case messages, evidence and decisions and add replies
- Support registration, score, eligibility, winner, payment and general cases
- Assign cases, set priority, monitor deadlines and escalate cases
- Separate participant-visible messages from internal notes
- Preserve immutable evidence, communication and status history
- Route final decisions to Compliance, Competition, Finance or Support according to category
- Require Support or Super Admin authority to close decided cases

## Phase 12 — Reports, analytics and audit

Operational reports, management analytics, season comparison, participant retention, prize spending, exports, and searchable audit history.

## Phase 13 — Testing, launch and annual rollover

Security testing, role testing, scoring tests, mobile checks, performance, backups, user acceptance testing, launch preparation, season closure, archiving, Hall of Fame, and next-season creation.

## Phase 14 — Advanced features

Mobile app, social graphics, certificates, referrals, sponsor modules, AI insights, prediction games, and additional competitions.

## Branch naming

Use phase-based branch names:

```text
agent/phase-4-competition-operations
agent/phase-5-participant-registration
agent/phase-6-participant-verification
agent/phase-7-fantasy-provider
agent/phase-8-scores-leaderboards
agent/phase-9-winner-approval
agent/phase-10-prize-payments
agent/phase-11-communications-disputes
```

## Completion rule

A phase is only marked **Completed** after:

1. Code review is complete.
2. Vercel production build passes.
3. Required Supabase migrations are applied.
4. Security checks pass.
5. The feature is manually verified.
6. The pull request is merged into `main`.
