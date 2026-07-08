# Matching and aggregation rule for Incidents

None of the three feeds share a key: GLIDE arrives late and empty on ~98% of
GDACS Events; USGS `id` is unstable (the preferred id can switch seismic
networks between fetches); GDACS `eventid` stability is unverified either
way. GDACS Events also nest episodes whose colours can disagree with the
parent Event's colour, and a single earthquake mainshock can produce
hundreds of USGS aftershock Events.

Decision: an Incident is formed by matching Events on **hazard type + time
window + geographic proximity**, with the window/radius parameters set
**per hazard type** rather than one fixed pair for everything — initially
only Earthquake and Cyclone are tuned (the two hazard types verified live in
`feeds/`), with a conservative default for every other type. GLIDE is
applied only as a late confirmation signal on an already-matched Incident,
never as the primary key. GDACS matching operates at **Event granularity,
not Episode** — episodes are revisions within the Event they belong to, not
separate match candidates. Both USGS (`id`/`ids`) and GDACS (`eventid`) are
treated as potentially unstable identifiers and matched on set
intersection/aliasing rather than trusting a single id field, even though
only USGS has an observed instability finding — GDACS gets the same
defensive handling pre-emptively. Aftershock aggregation reuses this same
per-hazard-type time/geo window: any earthquake Event landing inside an
already-tracked Incident's window rolls into it, with no magnitude floor
excluding small aftershocks.

## Consequences

- Hazard types with no tuned window (anything beyond earthquake and
  cyclone) run on the conservative default until real data justifies
  per-type tuning — expect it to misfire (fragmenting or over-merging
  Incidents) until refined.
- Defensively handling GDACS `eventid` instability is speculative — no
  finding in `feeds/gdacs.md` currently supports it. Revisit if it turns
  out to be unnecessary overhead.
