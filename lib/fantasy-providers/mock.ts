import type {
  FantasyDataProvider,
  PreparedProviderBatch,
  ProviderEntryContext,
  ProviderRecordInput,
  ProviderRoundContext,
} from "./types";

export type MockProviderInput = {
  entries: ProviderEntryContext[];
  round: ProviderRoundContext;
};

function seedFrom(value: string) {
  let seed = 0;
  for (const character of value) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  }
  return seed;
}

export class MockFantasyProvider implements FantasyDataProvider<MockProviderInput> {
  readonly kind = "mock" as const;

  prepare(input: MockProviderInput): PreparedProviderBatch {
    if (!input.entries.length) {
      throw new Error("No approved eligible fantasy entries are available for a mock sync.");
    }

    const records: ProviderRecordInput[] = input.entries.map((entry) => {
      const seed = seedFrom(`${entry.provider_entry_id}:${input.round.external_round_id}`);
      const reportedPoints = 30 + (seed % 61);
      const transferCost = seed % 5 === 0 ? 4 : 0;
      const totalPoints = input.round.external_round_id * 45 + (seed % 300);

      return {
        provider_entry_id: entry.provider_entry_id,
        external_round_id: input.round.external_round_id,
        manager_name: entry.manager_name,
        team_name: entry.team_name,
        reported_points: reportedPoints,
        total_points: totalPoints,
        transfer_cost: transferCost,
        chip_used: null,
        round_rank: 1 + (seed % 1_000_000),
        overall_rank: 1 + ((seed * 17) % 10_000_000),
        is_provisional: true,
        raw_record: {
          provider_entry_id: entry.provider_entry_id,
          external_round_id: input.round.external_round_id,
          manager_name: entry.manager_name,
          team_name: entry.team_name,
          reported_points: reportedPoints,
          total_points: totalPoints,
          transfer_cost: transferCost,
          chip_used: null,
          round_rank: 1 + (seed % 1_000_000),
          overall_rank: 1 + ((seed * 17) % 10_000_000),
          is_provisional: true,
          generated_by: "MockFantasyProvider",
        },
      };
    });

    return {
      records,
      sourceLabel: `Mock ${input.round.name}`,
      sourceEndpoint: `mock://round/${input.round.external_round_id}`,
      responseData: {
        generated_at: new Date().toISOString(),
        round: input.round.external_round_id,
        records: records.map((record) => record.raw_record),
      },
    };
  }
}
