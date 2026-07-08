// Fixture: feeds/reliefweb.md's own example item (GLIDE-bearing earthquake
// record), plus a no-GLIDE disease outbreak (must fall through to the
// `Other` catch-all, ADR 0008) and a no-GLIDE cyclone (must be recovered
// via the title-keyword fallback).
import assert from "assert";
import { fetchReliefWebEvents } from "../src/ingest/reliefweb";

const FIXTURE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<item>
  <title>Venezuela: Earthquakes - Jun 2026</title>
  <link>https://reliefweb.int/disaster/eq-2026-000093-ven</link>
  <pubDate>Wed, 24 Jun 2026 00:00:00 +0000</pubDate>
  <description>
    &lt;div class="tag country"&gt;Affected country: Venezuela (Bolivarian Republic of)&lt;/div&gt;
    &lt;div class="tag glide"&gt;Glide: EQ-2026-000093-VEN&lt;/div&gt;
    &lt;p&gt;On 24 June 2026, two strong earthquakes, preliminarily measured at magnitudes 7.1 and 7.5, struck north-central Venezuela.&lt;/p&gt;
  </description>
</item>
<item>
  <title>Peru: Dengue Outbreak - Jul 2026</title>
  <link>https://reliefweb.int/disaster/ep-2026-000450-per</link>
  <pubDate>Mon, 06 Jul 2026 00:00:00 +0000</pubDate>
  <description>
    &lt;div class="tag country"&gt;Affected country: Peru&lt;/div&gt;
    &lt;p&gt;A dengue outbreak has been reported across several regions.&lt;/p&gt;
  </description>
</item>
<item>
  <title>Philippines: Tropical Cyclone BAVI-26</title>
  <link>https://reliefweb.int/disaster/tc-2026-000500-phl</link>
  <pubDate>Sun, 05 Jul 2026 00:00:00 +0000</pubDate>
  <description>
    &lt;div class="tag country"&gt;Affected country: Philippines&lt;/div&gt;
    &lt;p&gt;Tropical Cyclone BAVI-26 made landfall.&lt;/p&gt;
  </description>
</item>
</channel>
</rss>`;

export async function run(): Promise<void> {
  const realFetch = global.fetch;
  global.fetch = (async () =>
    ({ ok: true, status: 200, statusText: "OK", text: async () => FIXTURE_RSS } as any)) as any;

  try {
    const { events, rawResponse } = await fetchReliefWebEvents();

    assert.strictEqual(events.length, 3);
    assert.strictEqual(rawResponse, FIXTURE_RSS, "raw XML must be preserved verbatim for A2.4 diagnosability");

    const [quake, outbreak, cyclone] = events;

    assert.strictEqual(quake.feed, "reliefweb");
    assert.strictEqual(quake.hazardType, "Earthquake", "GLIDE's EQ prefix must resolve the hazard type");
    assert.deepStrictEqual(quake.sourceIds, ["eq-2026-000093-ven"], "id is the permanent URL slug");
    assert.strictEqual(quake.glide, "EQ-2026-000093-VEN");
    assert.strictEqual(quake.place, "Venezuela (Bolivarian Republic of)");
    assert.strictEqual(quake.occurredAtUtc, "2026-06-24T00:00:00.000Z");
    assert.deepStrictEqual(quake.location.coordinates, [-66.59, 6.42], "country centroid lookup must match despite the qualifier suffix");

    assert.strictEqual(outbreak.hazardType, "Other", "no GLIDE and no keyword match must fall through to the ADR 0008 catch-all");
    assert.strictEqual(outbreak.glide, null);

    assert.strictEqual(cyclone.hazardType, "Cyclone", "title keyword fallback must recover the hazard type when GLIDE is absent");
  } finally {
    global.fetch = realFetch;
  }
}
