import type {
  FantasyDataProvider,
  PreparedProviderBatch,
  ProviderRecordInput,
} from "./types";

export type CsvProviderInput = {
  text: string;
  fileName: string;
};

function parseCsvRows(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const input = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (quoted) throw new Error("The CSV file contains an unclosed quoted value.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function optionalInteger(value: string | undefined) {
  const cleaned = value?.trim() ?? "";
  if (!cleaned) return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanValue(value: string | undefined, fallback = true) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  return !["false", "0", "no", "n", "final"].includes(normalized);
}

function valueFrom(record: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = record[alias];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

export class CsvFantasyProvider implements FantasyDataProvider<CsvProviderInput> {
  readonly kind = "csv" as const;

  prepare(input: CsvProviderInput): PreparedProviderBatch {
    if (!input.text.trim()) throw new Error("The CSV file is empty.");

    const rows = parseCsvRows(input.text);
    if (rows.length < 2) throw new Error("The CSV file must contain a header and at least one data row.");
    if (rows.length - 1 > 5000) throw new Error("A CSV import cannot exceed 5,000 data rows.");

    const headers = rows[0].map(normalizeHeader);
    const requiredGroups = [
      ["provider_entry_id", "entry_id", "fpl_entry_id"],
      ["external_round_id", "round", "gameweek", "gw"],
      ["reported_points", "points", "gameweek_points", "gw_points"],
      ["total_points", "overall_points"],
    ];

    for (const aliases of requiredGroups) {
      if (!aliases.some((alias) => headers.includes(alias))) {
        throw new Error(`The CSV file is missing a required column: ${aliases[0]}.`);
      }
    }

    const records: ProviderRecordInput[] = rows.slice(1).map((cells) => {
      const rawRecord: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) rawRecord[header] = cells[index]?.trim() ?? "";
      });

      return {
        provider_entry_id:
          valueFrom(rawRecord, ["provider_entry_id", "entry_id", "fpl_entry_id"]) || null,
        external_round_id: optionalInteger(
          valueFrom(rawRecord, ["external_round_id", "round", "gameweek", "gw"]),
        ),
        manager_name: valueFrom(rawRecord, ["manager_name", "manager"]) || null,
        team_name: valueFrom(rawRecord, ["team_name", "fantasy_team_name"]) || null,
        reported_points: optionalInteger(
          valueFrom(rawRecord, ["reported_points", "points", "gameweek_points", "gw_points"]),
        ),
        total_points: optionalInteger(valueFrom(rawRecord, ["total_points", "overall_points"])),
        transfer_cost:
          optionalInteger(valueFrom(rawRecord, ["transfer_cost", "transfer_points", "hits"])) ?? 0,
        chip_used: valueFrom(rawRecord, ["chip_used", "chip"]) || null,
        round_rank: optionalInteger(valueFrom(rawRecord, ["round_rank", "gameweek_rank", "gw_rank"])),
        overall_rank: optionalInteger(valueFrom(rawRecord, ["overall_rank"])),
        is_provisional: booleanValue(valueFrom(rawRecord, ["is_provisional", "provisional"]), true),
        raw_record: rawRecord,
      };
    });

    return {
      records,
      sourceLabel: input.fileName,
      sourceEndpoint: `csv://${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      responseData: {
        file_name: input.fileName,
        headers,
        records: records.map((record) => record.raw_record),
      },
    };
  }
}
