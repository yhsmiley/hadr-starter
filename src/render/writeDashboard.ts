// Shared by scripts/sitrep.ts (the deterministic A1 pass) and
// scripts/render.ts (invoked by the `sitrep` Claude Code skill after it
// fills in pending narratives) -- one place reads current state and
// writes dashboard.html, so both call sites stay in sync by construction.
import { promises as fs } from "fs";
import path from "path";
import { readIncidents } from "../store/incidentStore";
import { readHealth } from "../store/healthStore";
import { renderDashboard } from "./dashboard";
import { Feed, FeedHealth } from "../types";

const DASHBOARD_PATH = path.join(__dirname, "..", "..", "..", "dashboard.html");

// One health line per feed with a live A7 job. Grows alongside the
// ingestion adapters, same rollout order as SLICES.md (V1: usgs; V2:
// + gdacs; V3: + reliefweb).
const LIVE_FEEDS: Feed[] = ["usgs", "gdacs"];

async function readHealthOrPending(feed: Feed, nowUtc: string): Promise<FeedHealth> {
  return (
    (await readHealth(feed)) ?? {
      feed,
      lastSuccessAtUtc: null,
      lastAttemptAtUtc: nowUtc,
      lastError: "no health record yet",
    }
  );
}

export async function writeDashboardFile(nowUtc: string = new Date().toISOString()): Promise<void> {
  const incidents = await readIncidents();
  const health = await Promise.all(LIVE_FEEDS.map((feed) => readHealthOrPending(feed, nowUtc)));

  const html = renderDashboard({ incidents, health, generatedAtUtc: nowUtc });
  await fs.writeFile(DASHBOARD_PATH, html, "utf8");
}
