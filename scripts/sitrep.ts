// A1 entrypoint (SLICES.md V2), and the deterministic half of the
// .github/workflows/sitrep.yml scaffold's own design: "a deterministic
// script decides whether anything changed; a headless model call runs
// only if it did." This script never calls a model. It ingests both live
// feeds, fuses, writes state, renders dashboard.html from whatever
// narratives already exist (satisfying A6.2 -- the freshness/health line
// updates today regardless), and signals whether the `sitrep` skill needs
// to run.
import { promises as fs } from "fs";
import path from "path";
import { fetchUsgsEvents } from "../src/ingest/usgs";
import { fetchGdacsEvents } from "../src/ingest/gdacs";
import { fetchReliefWebEvents } from "../src/ingest/reliefweb";
import { fuse } from "../src/fusion/fuse";
import { readIncidents, writeIncidents } from "../src/store/incidentStore";
import { writeDashboardFile } from "../src/render/writeDashboard";

const RAW_LOG_DIR = path.join(__dirname, "..", "..", "state", "raw");

async function logRawPayload(feed: string, rawResponse: unknown, nowUtc: string): Promise<void> {
  await fs.mkdir(RAW_LOG_DIR, { recursive: true });
  const datePart = nowUtc.slice(0, 10);
  // ReliefWeb's raw response is the RSS feed's own XML text, not JSON --
  // write it verbatim so the log stays diagnosable, same A2.4 purpose as
  // USGS/GDACS's JSON logs (undocumented schema drift, feeds/reliefweb.md
  // finding 3: the RSS is HTML blobs with no version contract either).
  const isXml = typeof rawResponse === "string";
  await fs.writeFile(
    path.join(RAW_LOG_DIR, `${feed}-${datePart}.${isXml ? "xml" : "json"}`),
    isXml ? (rawResponse as string) : JSON.stringify(rawResponse, null, 2) + "\n",
    "utf8"
  );
}

async function signalNeedsNarration(needsNarration: boolean): Promise<void> {
  console.log(`needs_narration=${needsNarration}`);
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    await fs.appendFile(outputFile, `needs_narration=${needsNarration}\n`, "utf8");
  }
}

async function main(): Promise<void> {
  const nowUtc = new Date().toISOString();

  const priorIncidents = await readIncidents();

  const [usgs, gdacs, reliefweb] = await Promise.all([
    fetchUsgsEvents(),
    fetchGdacsEvents(),
    fetchReliefWebEvents(),
  ]);
  await Promise.all([
    logRawPayload("usgs", usgs.rawResponses, nowUtc),
    logRawPayload("gdacs", gdacs.rawResponse, nowUtc),
    logRawPayload("reliefweb", reliefweb.rawResponse, nowUtc),
  ]);

  const incidents = fuse([...usgs.events, ...gdacs.events, ...reliefweb.events], priorIncidents, nowUtc);
  await writeIncidents(incidents);
  await writeDashboardFile(nowUtc);

  const needsNarration = incidents.some((i) => i.state !== "closed" && i.narrative === null);
  await signalNeedsNarration(needsNarration);

  console.log(`Sitrep pipeline ran: ${incidents.length} incident(s), ${nowUtc}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
