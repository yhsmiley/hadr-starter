// Fixture source: feeds/gdacs.md's own example payload, plus one
// Cyclone feature to exercise the V2 eventtype filter (SLICES.md: only
// eventtype=EQ is live until V3).
import assert from "assert";
import { readFileSync } from "fs";
import path from "path";
import { fetchGdacsEvents } from "../src/ingest/gdacs";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "gdacs-sample.json"), "utf8")
);

export async function run(): Promise<void> {
  const realFetch = global.fetch;
  global.fetch = (async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => fixture } as any)) as any;

  try {
    const { events } = await fetchGdacsEvents();

    assert.strictEqual(events.length, 1, "non-earthquake eventtype (TC) must be filtered out in V2");

    const [event] = events;
    assert.strictEqual(event.feed, "gdacs");
    assert.strictEqual(event.hazardType, "Earthquake");
    assert.deepStrictEqual(event.sourceIds, ["1550421"], "eventid, not episodeid, is the identity (ADR 0001)");
    assert.strictEqual(event.episodeId, "1716583");
    assert.strictEqual(event.place, "Earthquake in Japan");
    assert.strictEqual(event.estimate.magnitude, 4.6, "magnitude must be parsed out of htmldescription");
    assert.strictEqual(event.estimate.gdacsAlertLevel, "Green", "must use event-level alertlevel, never episodealertlevel");
    // Naive-but-UTC (feeds/README.md finding 7) -- must not be parsed as local time.
    assert.strictEqual(event.occurredAtUtc, "2026-07-06T11:29:36.000Z");
  } finally {
    global.fetch = realFetch;
  }
}
