// A3: Events + prior Incidents -> updated Incidents. Pure function --
// same inputs always produce the same output (SHAPING.md's whole reason
// for choosing Shape A). V1 scope only (SLICES.md): USGS/Earthquake only,
// magnitude is the only allowlisted field (ADR 0003).
import { FeedEvent, Incident } from "../types";
import { EARTHQUAKE_WINDOW, idsOverlap, isSameOrRelatedEarthquake } from "./match";
import { assignConfidenceTier } from "./confidence";

function cloneIncident(inc: Incident): Incident {
  return {
    ...inc,
    memberEvents: inc.memberEvents.map((e) => ({ ...e })),
    impactEstimates: inc.impactEstimates.map((e) => ({ ...e })),
    erratumLog: inc.erratumLog.map((e) => ({ ...e })),
  };
}

function mostRecentMember(inc: Incident): FeedEvent {
  return inc.memberEvents.reduce((latest, e) =>
    e.occurredAtUtc > latest.occurredAtUtc ? e : latest
  );
}

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000;
}

function newIncidentId(anchor: FeedEvent): string {
  const day = anchor.occurredAtUtc.slice(0, 10);
  const primaryId = anchor.sourceIds[0] ?? "unknown";
  return `usgs-eq-${day}-${primaryId}`;
}

/** ADR 0005: only the PAGER alert answers "who's affected" for USGS --
 *  magnitude is hazard physics, not impact (feeds/usgs.md finding 5). */
function buildImpactEstimates(inc: Incident): Incident["impactEstimates"] {
  const withAlert = inc.memberEvents.find((e) => e.estimate.pagerAlert);
  if (!withAlert) return [];
  return [
    {
      source: "usgs",
      label: "PAGER alert",
      value: withAlert.estimate.pagerAlert as string,
    },
  ];
}

export function fuse(
  incoming: FeedEvent[],
  priorIncidents: Incident[],
  nowUtc: string
): Incident[] {
  const incidents = priorIncidents.map(cloneIncident);

  // Chronological order so a mainshock is processed before its
  // aftershocks even if the feed doesn't return them in time order.
  const sorted = [...incoming]
    .filter((e) => e.hazardType === "Earthquake") // defensive; ingestion already filters
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));

  for (const event of sorted) {
    const matched = incidents.find((inc) =>
      isSameOrRelatedEarthquake(event, mostRecentMember(inc))
    );

    if (matched) {
      const existingIdx = matched.memberEvents.findIndex((m) =>
        idsOverlap(m.sourceIds, event.sourceIds)
      );

      if (existingIdx >= 0) {
        // Same physical event, refetched -- a revision candidate, never
        // a new member (ADR 0001: alias-set matching, not id-keying).
        const prior = matched.memberEvents[existingIdx];
        if (prior.estimate.magnitude !== event.estimate.magnitude) {
          matched.erratumLog.push({
            kind: "revised",
            atUtc: nowUtc,
            description: `Magnitude revised from ${prior.estimate.magnitude ?? "unknown"} to ${event.estimate.magnitude ?? "unknown"} (USGS ${event.sourceIds[0] ?? "?"}).`,
          });
          matched.state = "revised";
          matched.narrative = null; // stale -- the sitrep skill must re-narrate
        }
        matched.memberEvents[existingIdx] = event;
      } else {
        // A distinct new event in the same sequence -- an aftershock.
        matched.memberEvents.push(event);
        if (matched.state !== "revised") matched.state = "escalated";
        matched.narrative = null;
      }
    } else if (
      (event.estimate.magnitude ?? 0) >= EARTHQUAKE_WINDOW.newIncidentMagnitudeFloor
    ) {
      incidents.push({
        id: newIncidentId(event),
        hazardType: "Earthquake",
        memberEvents: [event],
        state: "new",
        confidenceTier: "single-source (USGS)",
        glide: null,
        impactEstimates: [],
        erratumLog: [],
        narrative: null,
      });
    }
    // else: unmatched and below the new-Incident floor -- noise, dropped
    // (feeds/usgs.md finding 4: most of `all_day` is below M4.5).
  }

  // A3.5: earthquake closing rule -- quiet period with no new member.
  for (const inc of incidents) {
    if (inc.state === "closed") continue;
    const quietHours = hoursBetween(mostRecentMember(inc).occurredAtUtc, nowUtc);
    if (quietHours > EARTHQUAKE_WINDOW.sequenceWindowDays * 24) {
      inc.state = "closed";
    }
  }

  for (const inc of incidents) {
    inc.confidenceTier = assignConfidenceTier(inc);
    inc.impactEstimates = buildImpactEstimates(inc);
  }

  // Housekeeping: drop Incidents closed long enough ago that they'll never
  // match again (EARTHQUAKE_WINDOW.sequenceWindowDays already elapsed
  // before closing) plus the same window again as a safety margin --
  // otherwise the state file grows forever. Not part of any ADR; a plain
  // implementation necessity for a file that's read/written every run.
  const PRUNE_AFTER_DAYS = EARTHQUAKE_WINDOW.sequenceWindowDays * 2;
  return incidents.filter((inc) => {
    if (inc.state !== "closed") return true;
    return hoursBetween(mostRecentMember(inc).occurredAtUtc, nowUtc) <= PRUNE_AFTER_DAYS * 24;
  });
}
