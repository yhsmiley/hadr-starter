// A4.3: one health file per feed, each written only by that feed's own
// A7 intraday health-check job (never by A1) -- so A1's daily commit and
// three independently-scheduled A7 commits can never race the same file.
import { promises as fs } from "fs";
import path from "path";
import { Feed, FeedHealth } from "../types";

// dist/src/store -> up 3 to escape dist/ entirely and reach the project root.
const STATE_DIR = path.join(__dirname, "..", "..", "..", "state");

function healthPath(feed: Feed): string {
  return path.join(STATE_DIR, `health-${feed}.json`);
}

export async function readHealth(feed: Feed): Promise<FeedHealth | null> {
  try {
    const raw = await fs.readFile(healthPath(feed), "utf8");
    return JSON.parse(raw) as FeedHealth;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeHealth(health: FeedHealth): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(
    healthPath(health.feed),
    JSON.stringify(health, null, 2) + "\n",
    "utf8"
  );
}
