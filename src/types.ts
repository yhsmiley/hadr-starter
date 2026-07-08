// Domain types per docs/PRD.md's data model and CONTEXT.md's glossary.
// V1 (see SLICES.md) only ever populates the USGS/Earthquake corners of
// these types -- the shapes are written to match the full plan so V2/V3
// extend them rather than replace them.

export type Feed = "usgs" | "gdacs" | "reliefweb";

export type HazardType =
  | "Earthquake"
  | "Cyclone"
  | "Flood"
  | "Volcano"
  | "Drought"
  | "Wildfire"
  | "Other";

// ADR 0002. V1 can only ever produce "single-source (USGS)" -- the other
// four tiers require GDACS/ReliefWeb (V2/V3).
export type ConfidenceTier =
  | "single-source (USGS)"
  | "single-source (GDACS)"
  | "shared-sensor (USGS+GDACS)"
  | "humanitarian-confirmed"
  | "humanitarian+instrument";

// feeds/README.md finding 5 / ADR 0003.
export type IncidentState =
  | "new"
  | "escalated"
  | "de-escalated"
  | "revised"
  | "closed"
  | "deleted";

/** A single row from a single feed's API (docs/PRD.md: Event). */
export interface FeedEvent {
  feed: Feed;
  hazardType: HazardType;
  /** Full alias/id set, not just the feed's "preferred" id (ADR 0001). */
  sourceIds: string[];
  /** GDACS only; always null for USGS. */
  episodeId: string | null;
  /** GLIDE number, when the feed carries one (GDACS: mostly empty per
   *  feeds/gdacs.md finding 7; ReliefWeb: reliably present per
   *  feeds/reliefweb.md finding 5; USGS: never). ADR 0001: GLIDE is only
   *  ever a late-confirmation signal on an already-matched Incident, never
   *  the primary matching key -- this field is what lets a ReliefWeb
   *  arrival find and confirm an existing Incident (A3.7). */
  glide: string | null;
  occurredAtUtc: string; // ISO 8601, UTC
  /** Human-readable location, e.g. USGS's "9 km NNE of Avalon, CA" --
   *  narration needs this without reaching into feed-specific rawPayload. */
  place: string;
  location: {
    type: "Point";
    coordinates: [number, number, number?]; // [lon, lat, depthKm?]
  };
  /** Feed-native estimate, carried through unmodified (ADR 0005). Fields
   *  are feed-specific by design -- there is no canonical merged impact
   *  number (ADR 0005 / ADR 0003's per-source-field diffing). */
  estimate: {
    magnitude?: number;
    pagerAlert?: "green" | "yellow" | "orange" | "red" | null; // USGS
    /** GDACS's own `alertlevel` (event-level, never `episodealertlevel`
     *  -- ADR 0001 matches at Event granularity, so anything else this
     *  codebase reads off a GDACS Event uses the same granularity). */
    gdacsAlertLevel?: "Green" | "Orange" | "Red" | null;
    /** GDACS's `iscurrent` -- the closing-authority signal for every
     *  ongoing hazard type (ADR 0003): Cyclone/Flood/Volcano/Drought/
     *  Wildfire close when GDACS itself marks the event non-current, not
     *  on a quiet-period timer like Earthquake. */
    gdacsIsCurrent?: boolean;
  };
  rawPayload: unknown;
}

/** The fused, cross-feed unit (docs/PRD.md: Incident). */
export interface Incident {
  id: string;
  hazardType: HazardType;
  memberEvents: FeedEvent[];
  state: IncidentState;
  confidenceTier: ConfidenceTier;
  glide: string | null;
  /** Every available feed's estimate, shown separately -- never blended (ADR 0005). */
  impactEstimates: Array<{ source: Feed; label: string; value: string }>;
  erratumLog: EratumEntry[];
  /**
   * A5's output -- written by the headless `sitrep` Claude Code skill, not
   * by this codebase. `null` means "awaiting narration": either brand new
   * this run, or invalidated by an escalation/revision. Never touched for
   * a `closed` Incident, which the renderer narrates with a fixed string
   * instead (SHAPING.md A5/A6 -- no model call needed for that case).
   */
  narrative: string | null;
}

export interface EratumEntry {
  kind: "revised" | "deleted" | "un-merged" | "re-merged" | "glide-relabel";
  atUtc: string;
  description: string;
}

/** One per feed (docs/PRD.md: Feed health record). */
export interface FeedHealth {
  feed: Feed;
  lastSuccessAtUtc: string | null;
  lastAttemptAtUtc: string;
  lastError: string | null;
}
