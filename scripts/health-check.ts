// A7 entrypoint (SLICES.md V1: USGS only). Pings one feed, records
// success/failure into that feed's own health file, and does nothing
// else -- no fusion, no Incident processing. Runs independently of and
// far more often than scripts/sitrep.ts (A1).
import { readHealth, writeHealth } from "../src/store/healthStore";
import { Feed } from "../src/types";

const USGS_PING_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

async function main(): Promise<void> {
  const feed = (process.argv[2] ?? "usgs") as Feed;
  if (feed !== "usgs") {
    throw new Error(
      `Health check for feed "${feed}" is dormant in V1 (SLICES.md) -- only usgs is live`
    );
  }

  const nowUtc = new Date().toISOString();
  try {
    const res = await fetch(USGS_PING_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
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
