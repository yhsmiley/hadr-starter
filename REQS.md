# REQS.md

Initial idea capture — HADR Monitor, Day 1.

## The fixed end-state (from README.md, not up for debate)

- An agent that watches GDACS, USGS, and ReliefWeb (see `feeds/`)
- Filters noise, assesses what remains, publishes a morning sitrep to
  `dashboard.html` at 08:30 Singapore time
- Runs on a schedule, unattended, stays quiet when nothing has changed

## The idea: cross-feed corroboration is the product

The three feeds are not independent witnesses to the same events — they're a
sensor, a triage layer, and a confirmation layer arriving at different
speeds, with no shared key (see `feeds/README.md`, findings 1–3). Most naive
implementations will either treat feed rows as already-matched events (and
double-report the same earthquake three times under three IDs) or bolt on ad
hoc dedup that silently drops real corroboration.

So: make the matching/fusion step the centerpiece, not an afterthought. The
sitrep's unit is "the disaster" (a fused record), not a raw feed row.

### Core mechanics

- **Matching rule**: hazard type + time window + geographic proximity.
  GLIDE, when present, is used as a late confirmation signal on an
  already-matched cluster — never as the primary key (it's empty on ~98% of
  GDACS events).
- **Confidence labeling**: every fused disaster record is labeled by how it
  was corroborated, e.g. "USGS+GDACS corroborated", "USGS only,
  unconfirmed", "ReliefWeb-confirmed". This label is the thing that answers
  "should I trust this line in the sitrep."
- **Shared-source awareness**: GDACS earthquake data sources from NEIC — the
  same origin as the USGS feed. Two feeds agreeing on a quake is one sensor
  network heard twice, not independent confirmation, and the sitrep must not
  imply otherwise (finding 3).
- **Aggregation above matching**: a single real-world disaster can spawn
  hundreds of USGS rows (mainshock + aftershocks) and a handful of GDACS
  episodes. The fusion layer needs to roll these into one reported unit, not
  one row per feed hit.

### What this means for the sitrep

- Grouped by fused disaster, not by feed.
- Each entry shows: what happened, where, severity, who's affected
  (attributed to whichever feed's estimate is being quoted — finding 4), and
  its corroboration label.
- Still needs the state machine (new/escalated/de-escalated/revised/
  closed/deleted) and feed-health lines from `feeds/README.md` — those are
  cross-cutting concerns this idea inherits, not a competing idea. This REQS
  just picks corroboration/fusion as the hard problem to design around
  first, since it's upstream of everything else (you can't track escalation
  or health on an event you haven't correctly identified as one event).

## Open questions to carry into grilling

- Exact time window and geo radius for "same event" (does it vary by hazard
  type — earthquake vs flood vs cyclone footprints are very different
  shapes)?
- How many corroboration confidence tiers, and does the sitrep filter/sort
  by them or just label?
- What happens when a later feed (ReliefWeb, days later) reveals two
  "matched" events were actually different disasters — does the fusion
  layer support un-merging?
- Where does GLIDE get attached once it does arrive — does it relabel
  history?

## Out of scope (for now)

- Building a general-purpose entity-resolution library — this is scoped to
  three known feeds with known shapes, not arbitrary future feeds.
- Real-time/sub-minute latency — USGS is the fastest feed and still updates
  on minute-scale; the product runs on a daily 08:30 cadence.
