export type CompetitionStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "active"
  | "completed"
  | "archived"
  | "cancelled";

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
  | "disqualified";

export type WinnerStatus =
  | "provisional"
  | "under_review"
  | "compliance_approved"
  | "rejected"
  | "confirmed"
  | "payment_pending"
  | "paid"
  | "published";

export type DataProviderKind = "mock" | "csv" | "approved_fpl" | "licensed";

export interface CompetitionSeason {
  id: string;
  competitionId: string;
  seasonId: string;
  name: string;
  status: CompetitionStatus;
  provider: DataProviderKind;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface FantasyEntry {
  id: string;
  registrationId: string;
  providerEntryId: string;
  managerName: string | null;
  teamName: string | null;
  verifiedAt: string | null;
}

export interface RoundScore {
  id: string;
  registrationId: string;
  roundId: string;
  reportedPoints: number;
  effectivePoints: number;
  transferCost: number;
  chipUsed: string | null;
  isProvisional: boolean;
  finalisedAt: string | null;
}
