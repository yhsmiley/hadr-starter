// Shared by scripts/sitrep.ts (the deterministic A1 pass) and
// scripts/render.ts (invoked by the `sitrep` Claude Code skill after it
// fills in pending narratives) -- one place reads current state and
// writes dashboard.html, so both call sites stay in sync by construction.
import { promises as fs } from "fs";
import path from "path";
import { readIncidents } from "../store/incidentStore";
import { readHealth } from "../store/healthStore";
import { renderDashboard } from "./dashboard";
import { FeedHealth } from "../types";

const DASHBOARD_PATH = path.join(__dirname, "..", "..", "..", "dashboard.html");

export async function writeDashboardFile(nowUtc: string = new Date().toISOString()): Promise<void> {
  const incidents = await readIncidents();
  const usgsHealth: FeedHealth =
    (await readHealth("usgs")) ?? {
      feed: "usgs",
      lastSuccessAtUtc: null,
      lastAttemptAtUtc: nowUtc,
      lastError: "no health record yet",
    };

  const html = renderDashboard({ incidents, health: [usgsHealth], generatedAtUtc: nowUtc });
  await fs.writeFile(DASHBOARD_PATH, html, "utf8");
}
