// ADR 0001: matching is hazard type + time window + geo proximity, with
// per-hazard-type parameters. V1 (SLICES.md) implemented Earthquake only;
// V3 adds Cyclone (tuned) and a conservative default for Flood/Volcano/
// Drought/Wildfire, plus ReliefWeb attachment.
//
// Exact window/radius numbers are an implementation judgment call every
// ADR here left open ("per-hazard-type parameters" without specifying
// values) -- logged in implementation-notes.md as tunable defaults, not a
// fixed spec.
import { FeedEvent, HazardType } from "../types";
import { haversineKm } from "./geo";

export interface HazardWindow {
  /** Rolling window from the most recent known member event. */
  sequenceWindowDays: number;
  radiusKm: number;
  /** ADR 0006: floor for triggering a *new* Incident from this hazard
   *  type's own instrument feed. `null` means no floor -- GDACS's list
   *  endpoint is already a curated "significant events" feed for every
   *  non-earthquake hazard type, so any incoming event is eligible. */
  newIncidentMagnitudeFloor: number | null;
}

export const EARTHQUAKE_WINDOW: HazardWindow = {
  sequenceWindowDays: 30,
  radiusKm: 150,
  newIncidentMagnitudeFloor: 4.5,
};

/** Tuned per ADR 0001 -- cyclones move along a track over one to a few
 *  weeks (feeds/gdacs.md finding 6: GDACS's point is a coarse centroid,
 *  not the true track), so both the window and radius are wider than
 *  Earthquake's tight aftershock-zone parameters. */
export const CYCLONE_WINDOW: HazardWindow = {
  sequenceWindowDays: 21,
  radiusKm: 500,
  newIncidentMagnitudeFloor: null,
};

/** ADR 0001's "conservative default for every other type" -- Flood,
 *  Volcano, Drought, Wildfire. Expected to misfire (fragment or
 *  over-merge) until real data justifies per-type tuning, same caveat
 *  ADR 0001 already logs. */
export const DEFAULT_WINDOW: HazardWindow = {
  sequenceWindowDays: 14,
  radiusKm: 100,
  newIncidentMagnitudeFloor: null,
};

/** feeds/reliefweb.md finding 2: latency is days to weeks -- ReliefWeb
 *  attachment gets its own, wider confirmation window rather than
 *  borrowing the instrument hazard-type window, since it's checking
 *  "does this humanitarian record describe an already-tracked disaster,"
 *  not "is this the same instrument reading." */
const RELIEFWEB_CONFIRM_WINDOW_DAYS = 45;

export function windowFor(hazardType: HazardType): HazardWindow {
  switch (hazardType) {
    case "Earthquake":
      return EARTHQUAKE_WINDOW;
    case "Cyclone":
      return CYCLONE_WINDOW;
    case "Other":
      throw new Error("Other is never cross-matched (ADR 0008) -- windowFor() should not be called for it");
    default:
      return DEFAULT_WINDOW;
  }
}

/** ADR 0001: both USGS `id`/`ids` and GDACS `eventid` are unstable --
 *  match on alias-set intersection, never a single id field. */
export function idsOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((id) => setB.has(id));
}

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000;
}

/** Crude but honest given ReliefWeb's country-only location data -- a
 *  substring check both ways so "Venezuela" matches USGS/GDACS's
 *  "...near Morón, Carabobo State, Venezuela" place string and vice versa. */
function placesOverlap(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  return na.includes(nb) || nb.includes(na);
}

/**
 * True if `event` is either:
 *  - the same physical event as `other` (alias overlap -- a refetch,
 *    possibly under a different "preferred" id), or
 *  - a related event in the same sequence.
 *
 * For two instrument events (USGS/GDACS), "related" means the hazard
 * type's time/geo window (ADR 0001). ReliefWeb carries no real geometry
 * (country centroid only, src/ingest/countryCentroids.ts) -- a GLIDE
 * match or same-place-within-confirmation-window substitutes for the geo
 * check whenever either side is a ReliefWeb event (ADR 0001: GLIDE is
 * only ever a late-confirmation signal, never the primary key, which is
 * why id/GLIDE overlap is still checked first even here).
 *
 * `Other` (ReliefWeb-only, ADR 0008) never matches anything, including
 * another `Other` event with the same hazard type -- it is always
 * single-source by construction.
 */
export function isSameOrRelated(event: FeedEvent, other: FeedEvent): boolean {
  if (idsOverlap(event.sourceIds, other.sourceIds)) return true;
  if (event.hazardType !== other.hazardType) return false;
  if (event.hazardType === "Other") return false;

  if (event.feed === "reliefweb" || other.feed === "reliefweb") {
    if (event.glide && other.glide && event.glide === other.glide) return true;
    const hours = hoursBetween(event.occurredAtUtc, other.occurredAtUtc);
    if (hours > RELIEFWEB_CONFIRM_WINDOW_DAYS * 24) return false;
    return placesOverlap(event.place, other.place);
  }

  const window = windowFor(event.hazardType);
  const hours = hoursBetween(event.occurredAtUtc, other.occurredAtUtc);
  if (hours > window.sequenceWindowDays * 24) return false;

  const km = haversineKm(
    [event.location.coordinates[0], event.location.coordinates[1]],
    [other.location.coordinates[0], other.location.coordinates[1]]
  );
  return km <= window.radiusKm;
}
