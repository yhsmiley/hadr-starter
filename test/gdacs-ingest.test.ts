// Fixture source: feeds/gdacs.md's own example payload, plus one
// Cyclone feature to exercise V3's full eventtype taxonomy (ADR 0008).
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

    assert.strictEqual(events.length, 2, "V3: every known eventtype is ingested, not just EQ");

    const [quake, cyclone] = events;
    assert.strictEqual(quake.feed, "gdacs");
    assert.strictEqual(quake.hazardType, "Earthquake");
    assert.deepStrictEqual(quake.sourceIds, ["1550421"], "eventid, not episodeid, is the identity (ADR 0001)");
    assert.strictEqual(quake.episodeId, "1716583");
    assert.strictEqual(quake.place, "Earthquake in Japan");
    assert.strictEqual(quake.estimate.magnitude, 4.6, "magnitude must be parsed out of htmldescription");
    assert.strictEqual(quake.estimate.gdacsAlertLevel, "Green", "must use event-level alertlevel, never episodealertlevel");
    assert.strictEqual(quake.estimate.gdacsIsCurrent, true);
    assert.strictEqual(quake.glide, null, "empty glide string must normalize to null");
    // Naive-but-UTC (feeds/README.md finding 7) -- must not be parsed as local time.
    assert.strictEqual(quake.occurredAtUtc, "2026-07-06T11:29:36.000Z");

    assert.strictEqual(cyclone.hazardType, "Cyclone", "ADR 0008: TC maps to the Cyclone hazard type");
    assert.strictEqual(cyclone.estimate.magnitude, undefined, "cyclones carry no 'M x.x' magnitude text");
    assert.strictEqual(cyclone.estimate.gdacsAlertLevel, "Red", "must use event-level alertlevel, never episodealertlevel");
  } finally {
    global.fetch = realFetch;
  }
}
