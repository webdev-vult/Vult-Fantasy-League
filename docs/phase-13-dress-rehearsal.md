# Phase 13 End-to-End Dress Rehearsal

This runbook verifies the controlled flow from provider staging through scoring, leaderboard publication, winner review, compliance review and manual payment recording.

## Safety boundary

Use **VULT test league** only. The seeded participants, phone numbers, prize values and transaction references are synthetic. Do not credit real Vult accounts and do not call a Vult payout API during this test.

The GitHub repository is intentionally public so a design collaborator can later work on public-facing imagery and presentation. Public visibility must not be used for secrets, credentials, participant exports or private operational evidence.

## Test season

- Competition season: `VULT test league`
- Competition season ID: `d2c13700-3e83-474c-a715-6bc2f24b369b`
- Provider: CSV / manual
- Rules: published test rules, minimum age 18, Sierra Leone, Vult account required, transfer deductions included, score-affecting chips excluded from weekly prize eligibility
- Weekly test prize: `TEST-WEEKLY-1` — SLE 1.00 TEST ONLY
- Monthly test prize: `TEST-MONTHLY-1` — SLE 2.00 TEST ONLY
- Overall test prize: `TEST-OVERALL-1` — SLE 3.00 TEST ONLY
- Test monthly period: `[TEST ONLY] Dress Rehearsal Month`, GW1–GW4

## Synthetic entries

| Entry ID | Manager | Team | Test Vult phone | Publicity |
|---|---|---|---|---|
| 900001 | Alpha Manager | Alpha United | +23299000101 | Yes |
| 900002 | Bravo Manager | Bravo City | +23299000102 | Yes |
| 900003 | Charlie Manager | Charlie Rovers | +23299000103 | Yes |
| 900004 | Delta Manager | Delta Stars | +23299000104 | Yes |
| 900005 | Echo Manager | Echo Athletic | +23299000105 | Yes |
| 900006 | Foxtrot Manager | Foxtrot FC | +23299000106 | Yes |
| 900007 | Golf Manager | Golf Wanderers | +23299000107 | No |

All seven test registrations are approved/eligible and have synthetic FPL and Vult verification. Age is based on the 18+ declaration, so winner eligibility should require Compliance review rather than a DOB-based automatic pass.

## Primary GW1 CSV

Upload `test-data/phase13_dress_rehearsal_gw1.csv` from Admin → Providers while `VULT test league` is selected.

Expected promoted effective points:

| Entry | Reported | Transfer cost | Effective | Chip | Weekly eligible |
|---|---:|---:|---:|---|---|
| 900003 | 84 | 0 | 84 | Triple Captain | No |
| 900001 | 82 | 4 | 78 | — | Yes |
| 900002 | 78 | 0 | 78 | — | Yes |
| 900004 | 75 | 0 | 75 | — | Yes |
| 900005 | 72 | 0 | 72 | — | Yes |
| 900006 | 71 | 0 | 71 | — | Yes |
| 900007 | 70 | 0 | 70 | — | Yes |

Expected round ranks are 1, 2, 2, 4, 5, 6, 7 respectively. Promotion first creates provisional scores. Finalise GW1 before winner generation.

## Leaderboard expectation

Publish the GW1 leaderboard after score finalisation. The current publication implementation includes publicity-consented entries only, so the expected public row count is **6**. Golf is intentionally omitted because publicity consent is false. Charlie may still appear at rank 1 on the leaderboard even though the Triple Captain makes the entry ineligible for the weekly prize.

This linkage between leaderboard participation and winner-publicity consent remains a policy/privacy item for final launch review.

## Expected weekly winner

Generate the weekly candidate using prize `TEST-WEEKLY-1` after GW1 is final.

Charlie has the highest effective score (84) but is excluded from weekly prize eligibility by the chip rule. Alpha and Bravo tie on 78. The published test tie-breaker is lowest FPL Entry ID followed by earliest registration, therefore **Alpha Manager / Alpha United / Entry 900001** should be selected.

Because only the age declaration is recorded, the candidate should be `review_required` and generated in `under_review` state.

## Approval and payment rehearsal

1. Competition Manager approves the Alpha candidate with documented notes.
2. Compliance Officer reviews the synthetic age declaration and Vult phone verification, then approves.
3. Super Admin confirms the winner.
4. Prepare payment. Expected settlement is SLE 1.00 TEST ONLY and `destination_pending`.
5. Compliance/Super Admin verifies destination `+23299000101`; expected next state is `finance_review`.
6. Finance Officer or Super Admin approves the test settlement. A real Finance Officer must exist before production prize payments.
7. Record a manual payment using transaction reference `TEST-VULT-GW1-0001`, a current/past credit time, and notes clearly stating that this is UAT only. **Do not make a real Vult credit.**
8. Expected final state: prize payment `paid`, winner candidate `paid`, audit history contains each decision.

## Negative-provider validation

`test-data/phase13_provider_negative_cases.csv` contains an unknown Entry ID, manager-name warning, points above the accepted range, transfer cost above the accepted range and an unknown Gameweek. Use it separately to verify validation messages; do not mix it into the successful rehearsal run.

## Remaining real-season decisions

The dress rehearsal does not invent production business values. Before real award processing the business owner must provide the approved weekly/monthly/overall prize values, monthly Gameweek mappings and the Finance Officer assignment. The live 2026/27 published rules currently require governance review before changing the Vult-account requirement because existing registrations accepted rules version 1.
