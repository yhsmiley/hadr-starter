# Hazard-type taxonomy

Matching windows (ADR 0001), change-taxonomy allowlists, and closing rules
(ADR 0003) are all keyed on "hazard type," but no feed hands us one
consistent taxonomy: GDACS's `eventtype` is a clean enum (EQ/TC/FL/VO/DR/
WF); USGS's `type` field is mostly "earthquake" but includes non-hazard
noise like `explosion`, quarry blasts and ice quakes (`feeds/usgs.md`
finding 4); ReliefWeb covers things with no GDACS equivalent at all
(disease outbreaks, hailstorms, per `feeds/reliefweb.md` finding 1).

Decision: canonicalize on **GDACS's `eventtype` enum** (Earthquake, Cyclone,
Flood, Volcano, Drought, Wildfire) since GDACS is the multi-hazard feed.
USGS Events whose `type` is not `earthquake` are filtered out before
matching — never promoted to Incidents. ReliefWeb Events describing a
hazard with no GDACS-equivalent type (outbreak, hailstorm, etc.) get a
catch-all `Other` hazard type: always single-source, never attempted for
cross-feed matching.

## Consequences

`Other` inherits the "conservative default" matching parameters from ADR
0001 in name only — since it's defined here as never cross-matched, its
window/radius are moot. If a future feed or requirement needs cross-matching
within `Other`, this ADR's catch-all treatment needs revisiting first.
