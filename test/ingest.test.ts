// Fixture source: feeds/usgs.md's own example payload, plus one
// non-earthquake feature to exercise the ADR 0008 filter -- per
// docs/PRD.md's Testing Decisions ("the example payloads already
// captured in feeds/usgs.md ... are the seed fixtures").
import assert from "assert";
import { readFileSync } from "fs";
import path from "path";
import { fetchUsgsEvents } from "../src/ingest/usgs";

// Read from the source tree (test/fixtures), not __dirname -- tsc doesn't
// copy non-.ts assets into dist/, so this must be resolved from the repo
// root, which is always the cwd these tests run from (npm test / node
// dist/test/run-all.js from the project root).
const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "usgs-sample.json"), "utf8")
);

export async function run(): Promise<void> {
  const realFetch = global.fetch;
  global.fetch = (async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => fixture } as any)) as any;

  try {
    const { events } = await fetchUsgsEvents();

    assert.strictEqual(events.length, 1, "non-earthquake 'explosion' feature must be filtered out (ADR 0008)");

    const [event] = events;
    assert.strictEqual(event.feed, "usgs");
    assert.strictEqual(event.hazardType, "Earthquake");
    assert.deepStrictEqual(
      event.sourceIds.slice().sort(),
      ["ci41287863", "us6000tafd"],
      "full alias list must be stored, not just the preferred id (ADR 0001)"
    );
    assert.strictEqual(event.place, "9 km NNE of Avalon, CA");
    assert.strictEqual(event.estimate.magnitude, 3.04);
    assert.strictEqual(event.occurredAtUtc, new Date(1783342082180).toISOString());
  } finally {
    global.fetch = realFetch;
  }
}

