// A2.2 (SLICES.md V2 + V3): GDACS adapter. V2 shipped Earthquake only; V3
// (ADR 0008) extends to GDACS's full eventtype enum -- Cyclone gets a
// tuned matching window (src/fusion/match.ts CYCLONE_WINDOW), Flood/
// Volcano/Drought/Wildfire get the conservative DEFAULT_WINDOW.
//  - Fetches EVENTS4APP; logs a truncation-risk warning at the ~100-cap
//    (ADR 0006) rather than attempting pagination (out of scope).
//  - Matches at Event granularity, never Episode (ADR 0001): `eventid` is
//    the identity, `episodeid` is stored but never used for matching.
//    `alertlevel` (event-level) is used, never `episodealertlevel`.
//  - `eventid` gets the same defensive alias-set handling as USGS `id`
//    despite no observed instability finding for it (ADR 0001).
//  - Timestamps are naive-but-UTC (feeds/README.md finding 7) -- treated
//    as UTC explicitly, never left for the parser to assume local time.
//  - `iscurrent` is carried through as `estimate.gdacsIsCurrent` -- the
//    closing-authority signal for every ongoing hazard type (ADR 0003).
//  - `glide` is carried through as the top-level `glide` field so a later
//    ReliefWeb arrival can confirm-match against it (ADR 0001/A3.7).
import { FeedEvent, HazardType } from "../types";

const EVENTS4APP_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP";
const TRUNCATION_RISK_COUNT = 100;

/** ADR 0008: canonicalize hazard type on GDACS's own eventtype enum. */
const EVENTTYPE_MAP: Record<string, HazardType> = {
  EQ: "Earthquake",
  TC: "Cyclone",
  FL: "Flood",
  VO: "Volcano",
  DR: "Drought",
  WF: "Wildfire",
};

interface GdacsFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    eventtype: string;
    eventid: number;
    episodeid: number;
    glide: string;
    name: string;
    htmldescription: string;
    alertlevel: "Green" | "Orange" | "Red";
    fromdate: string;
    iscurrent: string; // "true" / "false" -- GDACS ships booleans as strings
    iso3: string | null;
  };
}

interface GdacsFeatureCollection {
  type: "FeatureCollection";
  features: GdacsFeature[];
}

/** GDACS's list endpoint has no numeric magnitude field -- it's embedded
 *  in free text, e.g. "Green M 4.6 Earthquake in Japan at: ...". Only ever
 *  matches on Earthquake descriptions; other hazard types leave this
 *  undefined, which is expected (magnitude is an Earthquake-only concept). */
function parseMagnitude(htmldescription: string): number | undefined {
  const match = /\bM\s*([\d.]+)\b/.exec(htmldescription);
  return match ? Number(match[1]) : undefined;
}

/** Naive-UTC per feeds/README.md finding 7 -- append Z so the parser
 *  never assumes the runner's local timezone. */
function parseGdacsUtc(naive: string): string {
  return new Date(naive.endsWith("Z") ? naive : `${naive}Z`).toISOString();
}

function toFeedEvent(feature: GdacsFeature, hazardType: HazardType): FeedEvent {
  const { properties } = feature;
  return {
    feed: "gdacs",
    hazardType,
    sourceIds: [String(properties.eventid)],
    episodeId: String(properties.episodeid),
    glide: properties.glide ? properties.glide : null,
    occurredAtUtc: parseGdacsUtc(properties.fromdate),
    place: properties.name,
    location: { type: "Point", coordinates: feature.geometry.coordinates },
    estimate: {
      magnitude: parseMagnitude(properties.htmldescription),
      gdacsAlertLevel: properties.alertlevel,
      gdacsIsCurrent: properties.iscurrent === "true",
    },
    rawPayload: feature,
  };
}

export interface GdacsIngestResult {
  events: FeedEvent[];
  rawResponse: GdacsFeatureCollection;
}

export async function fetchGdacsEvents(): Promise<GdacsIngestResult> {
  const res = await fetch(EVENTS4APP_URL);
  if (!res.ok) {
    throw new Error(`GDACS fetch failed: ${res.status} ${res.statusText}`);
  }
  const collection = (await res.json()) as GdacsFeatureCollection;

  if (collection.features.length === TRUNCATION_RISK_COUNT) {
    console.warn(
      `GDACS EVENTS4APP returned exactly ${TRUNCATION_RISK_COUNT} features -- possible truncation (ADR 0006)`
    );
  }

  const events = collection.features
    .map((f): [GdacsFeature, HazardType | undefined] => [f, EVENTTYPE_MAP[f.properties.eventtype]])
    .filter((pair): pair is [GdacsFeature, HazardType] => pair[1] !== undefined)
    .map(([f, hazardType]) => toFeedEvent(f, hazardType));

  return {
    events,
    rawResponse: collection,
  };
}
