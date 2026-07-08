// A3: Events + prior Incidents -> updated Incidents. Pure function --
// same inputs always produce the same output (SHAPING.md's whole reason
// for choosing Shape A). V3 (SLICES.md) generalizes past earthquake-only:
// all six GDACS hazard types plus ReliefWeb's `Other` catch-all (ADR
// 0008), full 5-tier confidence (ADR 0002), per-hazard-type closing
// authority (ADR 0003), and cross-run un-merge/re-merge re-evaluation
// (ADR 0004).
import { FeedEvent, HazardType, Incident } from "../types";
import { idsOverlap, isSameOrRelated, windowFor, EARTHQUAKE_WINDOW } from "./match";
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
  const hazardSlug = anchor.hazardType.toLowerCase();
  return `${anchor.feed}-${hazardSlug}-${day}-${primaryId}`;
}

const GDACS_ALERT_RANK: Record<string, number> = { Green: 0, Orange: 1, Red: 2 };

/** `undefined` means no comparable colour on one/both sides -- not a change. */
function compareGdacsAlertLevel(
  prior?: string | null,
  next?: string | null
): "up" | "down" | undefined {
  if (!prior || !next || prior === next) return undefined;
  const priorRank = GDACS_ALERT_RANK[prior];
  const nextRank = GDACS_ALERT_RANK[next];
  if (priorRank === undefined || nextRank === undefined) return undefined;
  return nextRank > priorRank ? "up" : "down";
}

/** ADR 0005: never one blended number. USGS's PAGER alert and GDACS's
 *  alert colour are both "who's affected" signals (feeds/usgs.md finding
 *  5, feeds/gdacs.md finding 1) -- shown side by side when both exist.
 *  ReliefWeb contributes no numeric line here by design (implementation-
 *  notes.md): its RSS carries no structured impact figure, only the
 *  humanitarian-confirmed/humanitarian+instrument tier itself, which ADR
 *  0002 already treats as the strongest available signal. */
function buildImpactEstimates(inc: Incident): Incident["impactEstimates"] {
  const estimates: Incident["impactEstimates"] = [];
  const withPager = inc.memberEvents.find((e) => e.estimate.pagerAlert);
  if (withPager) {
    estimates.push({ source: "usgs", label: "PAGER alert", value: withPager.estimate.pagerAlert as string });
  }
  const withGdacsColour = inc.memberEvents.find((e) => e.estimate.gdacsAlertLevel);
  if (withGdacsColour) {
    estimates.push({
      source: "gdacs",
      label: "Alert level",
      value: withGdacsColour.estimate.gdacsAlertLevel as string,
    });
  }
  return estimates;
}

/** A3.1 main ingestion loop: incoming USGS/GDACS ("instrument") events,
 *  chronological so a mainshock/first-episode is processed before later
 *  members even if the feed doesn't return them in time order. ReliefWeb
 *  is handled separately (attachReliefWebEvents) -- it never originates a
 *  *matched* incident via this loop's window logic, only via GLIDE/place
 *  attachment. */
function ingestInstrumentEvents(incidents: Incident[], incoming: FeedEvent[], nowUtc: string): void {
  const sorted = [...incoming]
    .filter((e) => e.feed === "usgs" || e.feed === "gdacs")
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));

  for (const event of sorted) {
    const matched = incidents.find((inc) => isSameOrRelated(event, mostRecentMember(inc)));

    if (matched) {
      const existingIdx = matched.memberEvents.findIndex((m) =>
        idsOverlap(m.sourceIds, event.sourceIds)
      );

      if (existingIdx >= 0) {
        // Same physical event, refetched -- a revision candidate, never
        // a new member (ADR 0001: alias-set matching, not id-keying).
        const prior = matched.memberEvents[existingIdx];
        const magnitudeChanged = prior.estimate.magnitude !== event.estimate.magnitude;

        if (magnitudeChanged) {
          // A measurement correction, not a real-world escalation --
          // "revised" per implementation-notes.md's V2 decision. Takes
          // precedence over a simultaneous colour change: a correction is
          // the more consequential thing to surface. Only ever fires for
          // Earthquake in practice -- other hazard types carry no
          // magnitude field, so both sides are `undefined` and this
          // never trips (see implementation-notes.md's V3 entry).
          matched.erratumLog.push({
            kind: "revised",
            atUtc: nowUtc,
            description: `Magnitude revised from ${prior.estimate.magnitude ?? "unknown"} to ${event.estimate.magnitude ?? "unknown"} (${event.feed.toUpperCase()} ${event.sourceIds[0] ?? "?"}).`,
          });
          matched.state = "revised";
          matched.narrative = null; // stale -- the sitrep skill must re-narrate
        } else {
          // No magnitude correction -- check GDACS's alert colour for a
          // genuine severity change (ADR 0003's allowlist), applicable to
          // every GDACS-sourced hazard type, not just Earthquake.
          const colourChange = compareGdacsAlertLevel(
            prior.estimate.gdacsAlertLevel,
            event.estimate.gdacsAlertLevel
          );
          if (colourChange === "up") {
            matched.state = "escalated";
            matched.narrative = null;
          } else if (colourChange === "down") {
            matched.state = "de-escalated";
            matched.narrative = null;
          }
        }
        matched.memberEvents[existingIdx] = event;
      } else {
        // A distinct new event in the same sequence -- an aftershock,
        // a new episode, or a second instrument catching the same hazard.
        matched.memberEvents.push(event);
        if (matched.state !== "revised") matched.state = "escalated";
        matched.narrative = null;
      }
    } else {
      // ADR 0006: Earthquake alone has a numeric floor (matches GDACS's
      // own global detection floor, filters USGS's `all_day` noise).
      // Every other GDACS-sourced hazard type has no floor -- EVENTS4APP
      // is already a curated "significant events" list.
      const floor = windowFor(event.hazardType).newIncidentMagnitudeFloor;
      if (floor === null || (event.estimate.magnitude ?? 0) >= floor) {
        incidents.push({
          id: newIncidentId(event),
          hazardType: event.hazardType,
          memberEvents: [event],
          state: "new",
          confidenceTier: event.feed === "gdacs" ? "single-source (GDACS)" : "single-source (USGS)",
          glide: event.glide,
          impactEstimates: [],
          erratumLog: [],
          narrative: null,
        });
      }
      // else: unmatched and below the new-Incident floor -- noise, dropped
      // (feeds/usgs.md finding 4: most of `all_day` is below M4.5).
    }
  }
}

/** A2.3/A3.7: ReliefWeb events never originate a match via time/geo (no
 *  real geometry -- src/ingest/countryCentroids.ts is display-only).
 *  Instead each event either attaches to an existing Incident (GLIDE or
 *  place-name match, checked against every member so a humanitarian
 *  record can catch up to an instrument sequence reported after it) or
 *  becomes its own standalone Incident -- always true for `Other`
 *  (ADR 0008: never cross-matched), and true for any other hazard type
 *  with no instrument coverage yet. A first-time attach to a
 *  previously-instrument-only Incident upgrades its confidence tier
 *  (ADR 0002) and that upgrade is logged as an explicit `glide-relabel`
 *  erratum (ADR 0004) -- never a silent tier change. */
function attachReliefWebEvents(incidents: Incident[], incoming: FeedEvent[], nowUtc: string): void {
  const sorted = [...incoming]
    .filter((e) => e.feed === "reliefweb")
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));

  for (const event of sorted) {
    const matched = incidents.find((inc) => inc.memberEvents.some((m) => isSameOrRelated(event, m)));

    if (matched) {
      const existingIdx = matched.memberEvents.findIndex((m) =>
        idsOverlap(m.sourceIds, event.sourceIds)
      );

      if (existingIdx >= 0) {
        // Same ReliefWeb record, refetched -- replace with the freshest
        // text. The RSS carries no structured change signal (ADR 0006),
        // so this never produces its own erratum.
        matched.memberEvents[existingIdx] = event;
      } else {
        const tierBefore = assignConfidenceTier(matched);
        matched.memberEvents.push(event);
        if (event.glide) matched.glide = event.glide;
        const tierAfter = assignConfidenceTier(matched);
        if (tierAfter !== tierBefore) {
          matched.erratumLog.push({
            kind: "glide-relabel",
            atUtc: nowUtc,
            description: `ReliefWeb confirmation attached${event.glide ? ` (GLIDE ${event.glide})` : ""} -- confidence upgraded from ${tierBefore} to ${tierAfter}.`,
          });
          matched.narrative = null;
        }
      }
    } else {
      incidents.push({
        id: newIncidentId(event),
        hazardType: event.hazardType,
        memberEvents: [event],
        state: "new",
        confidenceTier: "humanitarian-confirmed",
        glide: event.glide,
        impactEstimates: [],
        erratumLog: [],
        narrative: null,
      });
    }
  }
}

/** Union-find over an Incident's own member events, using the same
 *  matching rule that decided they belonged together in the first place
 *  (ADR 0001). Anything not connected to the largest group any more --
 *  e.g. a later, more precise location moving an Event outside the
 *  window -- is genuinely a different Incident now. */
function connectedComponents(members: FeedEvent[]): FeedEvent[][] {
  const parent = members.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (isSameOrRelated(members[i], members[j])) union(i, j);
    }
  }
  const groups = new Map<number, FeedEvent[]>();
  for (let i = 0; i < members.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(members[i]);
  }
  return Array.from(groups.values());
}

/** A3.6: re-checks every multi-member Incident's constituent Events
 *  against the matching rule on every run, not only when a new event
 *  arrives for it (ADR 0004). `Other` is skipped -- ADR 0008 never
 *  cross-matches it, so it can never have more than one member to begin
 *  with (see attachReliefWebEvents). */
function unmergeStaleIncidents(incidents: Incident[], nowUtc: string): Incident[] {
  const result: Incident[] = [];
  for (const inc of incidents) {
    if (inc.hazardType === "Other" || inc.memberEvents.length < 2) {
      result.push(inc);
      continue;
    }
    const components = connectedComponents(inc.memberEvents);
    if (components.length === 1) {
      result.push(inc);
      continue;
    }
    // Keep the component containing the most recent activity under the
    // original id; split the rest into brand-new Incidents.
    components.sort((a, b) => {
      const latestA = a.reduce((l, e) => (e.occurredAtUtc > l ? e.occurredAtUtc : l), "");
      const latestB = b.reduce((l, e) => (e.occurredAtUtc > l ? e.occurredAtUtc : l), "");
      return latestB.localeCompare(latestA);
    });
    const [keep, ...split] = components;
    const splitCount = split.reduce((n, g) => n + g.length, 0);
    inc.memberEvents = keep;
    inc.erratumLog.push({
      kind: "un-merged",
      atUtc: nowUtc,
      description: `${splitCount} event(s) no longer match this Incident's window and were split out.`,
    });
    inc.narrative = null;
    result.push(inc);

    for (const group of split) {
      const anchor = group.reduce((latest, e) => (e.occurredAtUtc > latest.occurredAtUtc ? e : latest));
      result.push({
        id: newIncidentId(anchor),
        hazardType: inc.hazardType,
        memberEvents: group,
        state: "new",
        confidenceTier: "single-source (USGS)", // placeholder -- recomputed below
        glide: group.find((e) => e.glide)?.glide ?? null,
        impactEstimates: [],
        erratumLog: [
          {
            kind: "un-merged",
            atUtc: nowUtc,
            description: `Split from Incident ${inc.id} -- no longer matches its window.`,
          },
        ],
        narrative: null,
      });
    }
  }
  return result;
}

/** A3.6, the other direction: two currently-separate Incidents of the
 *  same hazard type that now satisfy the matching rule against each
 *  other (e.g. a corrected location moves them together) are re-merged
 *  into one, keeping the earlier-created id. `Other` never re-merges
 *  (ADR 0008). */
function remergeIncidents(incidents: Incident[], nowUtc: string): Incident[] {
  const result = [...incidents];
  for (let i = 0; i < result.length; i++) {
    for (let j = result.length - 1; j > i; j--) {
      const a = result[i];
      const b = result[j];
      if (a.hazardType !== b.hazardType || a.hazardType === "Other") continue;
      const related = a.memberEvents.some((ma) => b.memberEvents.some((mb) => isSameOrRelated(ma, mb)));
      if (related) {
        a.memberEvents.push(...b.memberEvents);
        a.erratumLog.push(...b.erratumLog);
        a.erratumLog.push({
          kind: "re-merged",
          atUtc: nowUtc,
          description: `Re-merged with Incident ${b.id} -- both now match the same window.`,
        });
        if (!a.glide) a.glide = b.glide;
        a.narrative = null;
        result.splice(j, 1);
      }
    }
  }
  return result;
}

/** A3.5, generalized per hazard type (ADR 0003): Earthquake closes on a
 *  fixed quiet period; every ongoing GDACS-sourced hazard type closes
 *  when GDACS itself marks the event non-current, or when it drops out
 *  of the feed entirely. `Other` and any Incident with no GDACS member
 *  yet has no closing authority at all under RSS-only ingestion -- a
 *  documented gap (implementation-notes.md), not a silent guess. */
function applyClosingRules(incidents: Incident[], incoming: FeedEvent[], nowUtc: string): void {
  const incomingGdacsIds = new Set(
    incoming.filter((e) => e.feed === "gdacs").flatMap((e) => e.sourceIds)
  );

  for (const inc of incidents) {
    if (inc.state === "closed") continue;

    if (inc.hazardType === "Earthquake") {
      const quietHours = hoursBetween(mostRecentMember(inc).occurredAtUtc, nowUtc);
      if (quietHours > EARTHQUAKE_WINDOW.sequenceWindowDays * 24) {
        inc.state = "closed";
      }
      continue;
    }

    if (inc.hazardType === "Other") continue; // documented gap -- no closing-authority feed under RSS-only ingestion

    const gdacsMembers = inc.memberEvents.filter((e) => e.feed === "gdacs");
    if (gdacsMembers.length === 0) continue; // documented gap -- same reasoning as `Other`, no instrument closing authority yet

    const latestGdacs = gdacsMembers.reduce((a, b) => (a.occurredAtUtc > b.occurredAtUtc ? a : b));
    const stillInFeed = latestGdacs.sourceIds.some((id) => incomingGdacsIds.has(id));
    if (latestGdacs.estimate.gdacsIsCurrent === false || !stillInFeed) {
      inc.state = "closed";
    }
  }
}

function pruneAfterDays(hazardType: HazardType): number {
  if (hazardType === "Other") return Infinity; // never closes (see applyClosingRules), so never prunes either
  return windowFor(hazardType).sequenceWindowDays * 2;
}

export function fuse(
  incoming: FeedEvent[],
  priorIncidents: Incident[],
  nowUtc: string
): Incident[] {
  let incidents = priorIncidents.map(cloneIncident);

  ingestInstrumentEvents(incidents, incoming, nowUtc);
  attachReliefWebEvents(incidents, incoming, nowUtc);

  incidents = unmergeStaleIncidents(incidents, nowUtc);
  incidents = remergeIncidents(incidents, nowUtc);

  applyClosingRules(incidents, incoming, nowUtc);

  for (const inc of incidents) {
    inc.confidenceTier = assignConfidenceTier(inc);
    inc.impactEstimates = buildImpactEstimates(inc);
  }

  // Housekeeping: drop Incidents closed long enough ago that they'll never
  // match again, plus the same window again as a safety margin --
  // otherwise the state file grows forever. Not part of any ADR; a plain
  // implementation necessity for a file that's read/written every run.
  return incidents.filter((inc) => {
    if (inc.state !== "closed") return true;
    return hoursBetween(mostRecentMember(inc).occurredAtUtc, nowUtc) <= pruneAfterDays(inc.hazardType) * 24;
  });
}
