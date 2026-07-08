// A2.1 (SLICES.md V1): USGS adapter.
//  - `4.5_day` and `all_day` are both fetched; ADR 0006's floor is
//    enforced in fusion (src/fusion/fuse.ts), not here -- see
//    implementation-notes.md for why that split moved.
//  - Drops non-`earthquake` `type`s (ADR 0008): explosions, quarry
//    blasts, ice quakes never become Events.
//  - Stores the full `ids` alias list, not just `id` (ADR 0001).
import { FeedEvent } from "../types";

const ENDPOINTS = {
  fourPointFiveDay:
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
  allDay: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
};

interface UsgsFeature {
  type: "Feature";
  properties: {
    mag: number | null;
    type: string;
    time: number;
    alert: "green" | "yellow" | "orange" | "red" | null;
    ids: string;
    title: string;
    place: string | null;
  };
  geometry: { type: "Point"; coordinates: [number, number, number] };
  id: string;
}

interface UsgsFeatureCollection {
  type: "FeatureCollection";
  metadata: { generated: number; title: string; count: number };
  features: UsgsFeature[];
}

function parseAliasIds(feature: UsgsFeature): string[] {
  // properties.ids looks like ",ci41287863,us6000tafd,"
  const fromList = feature.properties.ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([feature.id, ...fromList]));
}

function toFeedEvent(feature: UsgsFeature): FeedEvent {
  return {
    feed: "usgs",
    hazardType: "Earthquake",
    sourceIds: parseAliasIds(feature),
    episodeId: null,
    glide: null, // USGS never carries a GLIDE number
    occurredAtUtc: new Date(feature.properties.time).toISOString(),
    place: feature.properties.place ?? feature.properties.title,
    location: { type: "Point", coordinates: feature.geometry.coordinates },
    estimate: {
      magnitude: feature.properties.mag ?? undefined,
      pagerAlert: feature.properties.alert,
    },
    rawPayload: feature,
  };
}

async function fetchGeoJson(url: string): Promise<UsgsFeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return (await res.json()) as UsgsFeatureCollection;
}

export interface UsgsIngestResult {
  events: FeedEvent[];
  rawResponses: UsgsFeatureCollection[];
}

export async function fetchUsgsEvents(): Promise<UsgsIngestResult> {
  const [fourFive, allDay] = await Promise.all([
    fetchGeoJson(ENDPOINTS.fourPointFiveDay),
    fetchGeoJson(ENDPOINTS.allDay),
  ]);

  // all_day is a superset of 4.5_day almost always, but fetch-time skew
  // means it isn't guaranteed -- de-dupe by id union rather than assuming.
  const byId = new Map<string, UsgsFeature>();
  for (const f of [...fourFive.features, ...allDay.features]) {
    if (f.properties.type !== "earthquake") continue; // ADR 0008
    byId.set(f.id, f);
  }

  return {
    events: Array.from(byId.values()).map(toFeedEvent),
    rawResponses: [fourFive, allDay],
  };
}
