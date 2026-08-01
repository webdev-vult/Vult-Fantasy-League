export const PROVIDER_KINDS = ["mock", "csv", "approved_fpl", "licensed"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type ProviderRecordInput = {
  provider_entry_id: string | null;
  external_round_id: number | null;
  manager_name: string | null;
  team_name: string | null;
  reported_points: number | null;
  total_points: number | null;
  transfer_cost: number;
  chip_used: string | null;
  round_rank: number | null;
  overall_rank: number | null;
  is_provisional: boolean;
  raw_record: Record<string, unknown>;
};

export type ProviderEntryContext = {
  id: string;
  registration_id: string;
  provider_entry_id: string;
  manager_name: string | null;
  team_name: string | null;
  registration_status: string;
  eligibility_status: string;
};

export type ProviderRoundContext = {
  id: string;
  external_round_id: number;
  name: string;
  status: string;
};

export type ProviderValidationIssue = {
  provider_entry_id: string | null;
  external_round_id: number | null;
  stage: "configuration" | "fetch" | "parse" | "validation" | "persistence" | "schedule";
  error_code: string;
  message: string;
  retriable: boolean;
  details: Record<string, unknown>;
};

export type ValidatedProviderRecord = ProviderRecordInput & {
  fantasy_entry_id: string | null;
  registration_id: string | null;
  round_id: string | null;
  validation_status: "valid" | "warning" | "rejected";
  validation_errors: string[];
};

export type PreparedProviderBatch = {
  records: ProviderRecordInput[];
  sourceLabel: string;
  sourceEndpoint: string;
  responseData: Record<string, unknown> | unknown[];
};

export interface FantasyDataProvider<TInput> {
  readonly kind: ProviderKind;
  prepare(input: TInput): Promise<PreparedProviderBatch> | PreparedProviderBatch;
}
