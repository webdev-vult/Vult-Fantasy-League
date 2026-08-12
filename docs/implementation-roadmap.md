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
| 11 | Notifications, announcements and disputes | Completed |
| 12 | Reports, analytics and audit | Completed |
| 13 | Launch hardening, cleanup, testing and annual rollover | In Progress |
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

Public competition pages, rules, prizes, registration form, seasonal registration, FPL identity matching, automatic FPL Entry ID resolution, consent records, age declaration, and registration-window enforcement.

## Phase 6 — Participant verification and management

Admin participant list, duplicate detection, FPL verification, Vult verification, age/compliance review, approval, rejection, suspension, disqualification, notes, status history, and exports.

## Phase 7 — Fantasy data-provider integration

Mock and CSV provider adapters, replaceable provider contracts, immutable raw snapshots, normalized staging records, validation, idempotency, retry lineage, structured integration errors, provider settings, and execution history. The approved FPL connector is read-only and may only use explicitly approved FPL endpoints. Phase 7 does not publish leaderboard scores; Phase 8 promotes reviewed staging records into scoring.

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
- Require a verified Vult destination when a cash or mixed prize requires one
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

- Provide role-aware, read-only management reporting for every configured season
- Show registration, eligibility, FPL verification, Vult verification and duplicate-risk funnels
- Monitor provider syncs, rounds, score promotion, leaderboard publication and winner workflows
- Report payment status, configured prize value, committed settlements, paid value and reversals by currency
- Track dispute volume, overdue cases, categories and notification delivery status
- Compare seasons using registrations, participants, finalised rounds, leaderboards, winners and paid prizes
- Calculate new versus returning participants and retention rate without hardcoding a season
- Show data freshness for each operational module
- Restrict searchable audit history to Super Admin and Auditor
- Filter audit events by text, action, entity, actor and date range
- Export season summary, operations, participant retention, prize spending and audit history as formula-safe CSV
- Record every export in immutable export history and the audit log

## Phase 13 — Launch hardening, cleanup, testing and annual rollover

Phase 13 is a hardening phase, not a feature-expansion phase. Existing workflows must be made internally consistent, safe to operate and reusable beyond the 2026/27 launch.

### Launch blockers

- Keep competition lifecycle status and configured registration dates consistent and visibly warn administrators about conflicts
- Replace the obsolete mandatory-DOB winner check with an age-declaration and compliance-verification workflow
- Make Date of Birth optional in normal participant correction workflows and only require additional age evidence when policy or Compliance requires it
- Configure and validate the real weekly, monthly and overall prize structure before awards are generated
- Configure monthly Gameweek periods before monthly scoring is used
- Run a complete FPL-to-score-to-winner-to-payment dress rehearsal before real prize processing

### FPL and scoring hardening

- Consolidate FPL network access behind one shared read-only client
- Include fixture access in the approved FPL endpoint contract rather than bypassing the main provider controls
- Replace Gameweek 1 hardcoding with current/next Gameweek discovery
- Add short-lived caching and rate protection for league identity lookups
- Define and test controlled score-sync scheduling while preserving human finalisation and winner approval
- Test transfer deductions, chip rules, ties, monthly aggregation and score corrections

### Multi-season hardening

- Remove the hardcoded 2026/27 public competition slug and other season-specific public assumptions
- Resolve the current public competition season from database configuration
- Resolve league identity, season labels, deadlines and current Gameweek dynamically
- Test season closure, archival, historical leaderboards and next-season creation without code changes

### Code and product cleanup

- Remove obsolete payment-attempt/reversal application actions that are no longer part of the manual Vult settlement model
- Remove development-phase labels from production admin pages
- Consolidate generated Supabase types to one canonical `types/database.ts`
- Reduce unnecessary `as any` casts after type consolidation
- Remove stale environment configuration and update `.env.example`
- Review the accidental duplicate competition record and archive the test competition after UAT
- Delete merged feature branches after Phase 13 is accepted

### Policy, privacy and documentation

- Update public registration, How It Works, Privacy, README and provider documentation to match the current Team + Manager registration flow
- Separate leaderboard participation rules from optional winner-publicity consent if approved by the business/privacy owner
- Document the manual Vult prize-payment operating procedure
- Document Gameweek operations, incident handling, disputes and annual rollover

### Security, quality and launch validation

- Confirm repository visibility is intentional and contains no secrets or private operational material
- Reduce public health-check detail to the minimum operational response
- Align remaining mutation RPCs with the service-role server-action pattern where practical
- Enable leaked-password protection before launch
- Add automated tests for critical registration, scoring, winner, payment, role and dispute rules
- Test all seven admin roles with real role separation
- Run mobile, accessibility, performance, export, backup/restore and production monitoring checks
- Complete UAT and production verification before marking Phase 13 complete

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
agent/phase-12-reports-analytics-audit
agent/phase-13-launch-hardening-cleanup
```

## Completion rule

A phase is only marked **Completed** after:

1. Code review is complete.
2. Vercel production build passes.
3. Required Supabase migrations are applied.
4. Security checks pass.
5. The feature is manually verified.
6. The pull request is merged into `main`.
