import type {
  ProviderEntryContext,
  ProviderRecordInput,
  ProviderRoundContext,
  ProviderValidationIssue,
  ValidatedProviderRecord,
} from "./types";

function sameText(left: string | null, right: string | null) {
  if (!left || !right) return true;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function validateProviderRecords(
  records: ProviderRecordInput[],
  entries: ProviderEntryContext[],
  rounds: ProviderRoundContext[],
) {
  const entryMap = new Map(entries.map((entry) => [entry.provider_entry_id, entry]));
  const roundMap = new Map(rounds.map((round) => [round.external_round_id, round]));
  const seen = new Set<string>();
  const issues: ProviderValidationIssue[] = [];

  const validated: ValidatedProviderRecord[] = records.map((record) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const entry = record.provider_entry_id ? entryMap.get(record.provider_entry_id) : undefined;
    const round = record.external_round_id ? roundMap.get(record.external_round_id) : undefined;
    const duplicateKey = `${record.provider_entry_id ?? "missing"}:${record.external_round_id ?? "missing"}`;

    if (!record.provider_entry_id) errors.push("Provider Entry ID is required.");
    if (!record.external_round_id || record.external_round_id < 1) {
      errors.push("External round ID must be a positive integer.");
    }
    if (record.reported_points === null || record.reported_points < -100 || record.reported_points > 500) {
      errors.push("Reported points must be between -100 and 500.");
    }
    if (record.total_points === null || record.total_points < 0 || record.total_points > 10_000) {
      errors.push("Total points must be between 0 and 10,000.");
    }
    if (record.transfer_cost < 0 || record.transfer_cost > 200) {
      errors.push("Transfer cost must be between 0 and 200.");
    }
    if (record.round_rank !== null && record.round_rank < 1) errors.push("Round rank must be positive.");
    if (record.overall_rank !== null && record.overall_rank < 1) errors.push("Overall rank must be positive.");

    if (seen.has(duplicateKey)) errors.push("This Provider Entry ID and round appear more than once in the batch.");
    seen.add(duplicateKey);

    if (!entry) {
      errors.push("No approved eligible registration matches this Provider Entry ID.");
    } else if (entry.registration_status !== "approved" || entry.eligibility_status !== "eligible") {
      errors.push("The matching registration is not approved and eligible.");
    }

    if (!round) errors.push("The referenced round does not exist in this competition season.");
    if (entry && !sameText(record.manager_name, entry.manager_name)) {
      warnings.push("Manager name differs from the verified fantasy entry.");
    }
    if (entry && !sameText(record.team_name, entry.team_name)) {
      warnings.push("Team name differs from the verified fantasy entry.");
    }

    const validationStatus = errors.length ? "rejected" : warnings.length ? "warning" : "valid";
    const messages = [...errors, ...warnings];

    if (messages.length) {
      issues.push({
        provider_entry_id: record.provider_entry_id,
        external_round_id: record.external_round_id,
        stage: "validation",
        error_code: errors.length ? "record_rejected" : "record_warning",
        message: messages.join("; "),
        retriable: errors.length > 0,
        details: { errors, warnings },
      });
    }

    return {
      ...record,
      fantasy_entry_id: entry?.id ?? null,
      registration_id: entry?.registration_id ?? null,
      round_id: round?.id ?? null,
      validation_status: validationStatus,
      validation_errors: messages,
    };
  });

  return { records: validated, issues };
}
