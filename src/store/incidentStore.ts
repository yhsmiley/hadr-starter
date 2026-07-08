// A4.1/A4.2: the Incident store. One file, written only by scripts/sitrep.ts
// (the daily A1 run) -- never by the intraday health-check jobs (A7),
// which own their own separate files (see healthStore.ts / SHAPING.md A4.3).
import { promises as fs } from "fs";
import path from "path";
import { Incident } from "../types";

// dist/src/store -> up 3 to escape dist/ entirely and reach the project root.
const STATE_DIR = path.join(__dirname, "..", "..", "..", "state");
const INCIDENTS_PATH = path.join(STATE_DIR, "incidents.json");

export async function readIncidents(): Promise<Incident[]> {
  try {
    const raw = await fs.readFile(INCIDENTS_PATH, "utf8");
    return JSON.parse(raw) as Incident[];
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function writeIncidents(incidents: Incident[]): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(INCIDENTS_PATH, JSON.stringify(incidents, null, 2) + "\n", "utf8");
}
