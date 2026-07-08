// ADR 0001: matching is hazard-type + time-window + geo-proximity, with
// per-hazard-type parameters. V1 only implements Earthquake (SLICES.md).
//
// Exact window/radius numbers are an implementation judgment call the ADR
// left open ("per-hazard-type parameters" without specifying values) --
// logged in implementation-notes.md as a tunable default, not a fixed spec.
import { FeedEvent } from "../types";
import { haversineKm } from "./geo";

export const EARTHQUAKE_WINDOW = {
  /** Rolling window from the most recent known member event. */
  sequenceWindowDays: 30,
  radiusKm: 150,
  /** ADR 0006: floor for triggering a *new* Incident. Aftershocks below
   *  this can still join an existing Incident (ADR 0001: "no magnitude
   *  floor" for aggregation). */
  newIncidentMagnitudeFloor: 4.5,
};

/** ADR 0001: both USGS `id`/`ids` and GDACS `eventid` are unstable --
 *  match on alias-set intersection, never a single id field. */
export function idsOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((id) => setB.has(id));
}

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000;
}

/**
 * True if `event` is either:
 *  - the same physical event as `anchor` (alias overlap -- a refetch,
 *    possibly under a different "preferred" id), or
 *  - a related event in the same aftershock sequence (within the
 *    hazard-type's time/geo window of `anchor`).
 *
 * `anchor` should be the most recent member event of a candidate
 * Incident, so the time window rolls forward with the sequence rather
 * than freezing at the mainshock's origin time.
 */
export function isSameOrRelatedEarthquake(
  event: FeedEvent,
  anchor: FeedEvent
): boolean {
  if (idsOverlap(event.sourceIds, anchor.sourceIds)) return true;

  const hours = hoursBetween(event.occurredAtUtc, anchor.occurredAtUtc);
  if (hours > EARTHQUAKE_WINDOW.sequenceWindowDays * 24) return false;

  const km = haversineKm(
    [event.location.coordinates[0], event.location.coordinates[1]],
    [anchor.location.coordinates[0], anchor.location.coordinates[1]]
  );
  return km <= EARTHQUAKE_WINDOW.radiusKm;
}
