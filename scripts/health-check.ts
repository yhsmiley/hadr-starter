// A7 entrypoint (SLICES.md V3: USGS + GDACS + ReliefWeb). Pings one feed,
// records success/failure into that feed's own health file, and does
// nothing else -- no fusion, no Incident processing. Runs independently
// of and on its own cadence, separate from scripts/sitrep.ts (A1).
import { readHealth, writeHealth } from "../src/store/healthStore";
import { Feed } from "../src/types";

const PING_URLS: Partial<Record<Feed, string>> = {
  usgs: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
  gdacs: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP",
  reliefweb: "https://reliefweb.int/disasters/rss.xml",
};

async function main(): Promise<void> {
  const feed = (process.argv[2] ?? "usgs") as Feed;
  const url = PING_URLS[feed];
  if (!url) {
    throw new Error(
      `Health check for feed "${feed}" is dormant (SLICES.md) -- live feeds: ${Object.keys(PING_URLS).join(", ")}`
    );
  }

  const nowUtc = new Date().toISOString();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.text(); // confirms the body is actually readable; ReliefWeb's is XML, not JSON
    await writeHealth({ feed, lastSuccessAtUtc: nowUtc, lastAttemptAtUtc: nowUtc, lastError: null });
  } catch (err) {
    const prior = await readHealth(feed);
    await writeHealth({
      feed,
      lastSuccessAtUtc: prior?.lastSuccessAtUtc ?? null,
      lastAttemptAtUtc: nowUtc,
      lastError: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  }
}

main();
