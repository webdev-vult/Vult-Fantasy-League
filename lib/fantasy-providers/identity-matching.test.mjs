import assert from "node:assert/strict";
import test from "node:test";
import { matchIdentity, normalizeIdentity } from "./identity-matching.ts";

const officialEntry = {
  entryId: "12345",
  teamName: "Aluta - Continua FC",
  managerName: "Mohamed Adams Sesay",
};

const candidates = [
  {
    value: officialEntry,
    teamName: officialEntry.teamName,
    managerName: officialEntry.managerName,
  },
];

test("normalization ignores case, spaces, hyphens and underscores", () => {
  assert.equal(
    normalizeIdentity(" ALUTA___CONTINUA - FC "),
    normalizeIdentity("Aluta - Continua FC"),
  );
});

test("matches a team when capitalization differs", () => {
  const result = matchIdentity(
    { teamName: "aluta - continua fc", managerName: "mohamed adams sesay" },
    candidates,
  );

  assert.deepEqual(result, { status: "matched", candidate: officialEntry });
});

test("matches the reported Aulta transposition and returns the official entry", () => {
  const result = matchIdentity(
    { teamName: "Aulta - continua fc", managerName: "mohamed Adams Sesay" },
    candidates,
  );

  assert.deepEqual(result, { status: "matched", candidate: officialEntry });
});

test("accepts one small typing mistake in each name", () => {
  const result = matchIdentity(
    { teamName: "Aluta - Continue FC", managerName: "Mohamad Adams Sesay" },
    candidates,
  );

  assert.deepEqual(result, { status: "matched", candidate: officialEntry });
});

test("rejects unrelated team details", () => {
  const result = matchIdentity(
    { teamName: "Another United", managerName: "Different Manager" },
    candidates,
  );

  assert.deepEqual(result, { status: "not_found" });
});

test("does not guess when two fuzzy matches are equally close", () => {
  const result = matchIdentity(
    { teamName: "Aluta Continua FC", managerName: "Mohamed Adams Sesay" },
    [
      {
        value: "first",
        teamName: "Aluta Continue FC",
        managerName: "Mohamed Adams Sesay",
      },
      {
        value: "second",
        teamName: "Aluta Continuo FC",
        managerName: "Mohamed Adams Sesay",
      },
    ],
  );

  assert.deepEqual(result, { status: "ambiguous" });
});

test("does not guess when two entries have identical normalized names", () => {
  const result = matchIdentity(
    { teamName: "Aluta Continua FC", managerName: "Mohamed Adams Sesay" },
    [
      { value: "first", teamName: "Aluta - Continua FC", managerName: "Mohamed Adams Sesay" },
      { value: "second", teamName: "Aluta Continua_FC", managerName: "Mohamed Adams Sesay" },
    ],
  );

  assert.deepEqual(result, { status: "ambiguous" });
});
