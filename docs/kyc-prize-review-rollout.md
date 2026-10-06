# KYC at prize review, not participation

Approved, eligible registrations with a verified FPL entry participate at any
KYC level (including 0). Weekly cutoffs, scoring, consent, duplicate-risk rules
and admin permissions are unchanged. KYC Level 1 (or a higher published prize
minimum) is checked against the current Vult verification and matching phone
before compliance approval, final winner confirmation and payment preparation.

## Deployment

1. Review the preview branch and apply
   `20261006023336_defer_kyc_until_prize_review.sql` to an isolated test database.
   This forward migration supports databases with or without the earlier
   `require_kyc_level_one_for_leaderboards` migration. Do not edit or rerun old
   migrations to undo that policy.
2. Run `supabase/tests/kyc_prize_review.sql` against the test database with
   `psql -v ON_ERROR_STOP=1`. It uses synthetic data in a rolled-back transaction.
3. After approval for production, apply the forward migration and deploy the
   application change together. A preview using the production database cannot
   exercise the changed winner rules until its database has this migration.
4. Verify an approved, FPL-verified Level 0 entry appears in live overall
   standings. The migration recalculates scores and publishes a new rule
   version, without changing registration statuses or KYC records.
5. Review and republish weekly/monthly snapshots if an earlier KYC-filtered
   snapshot omitted entries. Historical snapshots and winner decisions are not
   silently rewritten. Review any existing candidate generated under the old
   exclusion policy separately; confirmed/paid winners are not replaced.

## Winner workflow

1. Generate a candidate from final scores. A top-scoring Level 0 manager remains
   in score order and is marked `review_required`, not skipped as ineligible.
2. Complete competition review and request the required KYC upgrade from the
   selected participant.
3. Record the verified Vult account and KYC level in the participant record.
4. Complete compliance review and final confirmation. Both steps recheck the
   current KYC evidence; a prior approval cannot bypass a later failed check.
5. Prepare payment. Current KYC is checked again before creating settlement.

The stored generation checks remain an audit snapshot of the original review.
They are not rewritten when the participant subsequently completes KYC.

## Verification

- TypeScript and changed public-page lint checks.
- SQL regressions: Level 0 approval, ranks for levels 0–3, FPL/approval
  exclusions, weekly/monthly/overall publications and candidate selection,
  compliance/confirmation/payment blocking, matching account evidence and
  private function privileges.
- Test the migration against both prior schema states. Preserve existing RLS,
  RPC admin-role checks and function security modes; the new private helper is
  invoker-rights and callable only by `service_role`.

No production migration, winner generation, publication or email sending is
part of creating the preview branch.
