# HADR Monitor — PRD

**Status:** draft, pre-shaping · produced via `/to-prd` from `CONTEXT.md` +
`REQS.md` (and the ADRs/`QUESTIONS.md` that grilling produced) — synthesis
only, no new interview.

**Test seam (confirmed):** raw feed fixture payloads in → rendered sitrep
content (or the Incident list behind it) out. One seam for the whole
pipeline — ingestion, matching, the state machine, and rendering are all
exercised together, rather than tested as separate modules.

## Problem Statement

Responders and planners need to know, as early and accurately as possible,
what happened, where, how severe it is, and who is affected. Today that
means manually cross-referencing GDACS, USGS, and ReliefWeb — three feeds
that update at different speeds, use different (and sometimes unstable)
IDs, and don't agree with each other. A human doing this by hand either
double-counts the same earthquake reported three different ways, or misses
that two things that looked like the same event were actually different
disasters. A morning with genuinely nothing happening also looks identical
to a morning where a feed silently went down, so even the absence of
alarms can't be trusted without extra work.

## Solution

An unattended agent fetches GDACS, USGS, and ReliefWeb on a schedule and
fuses their raw per-feed **Events** into cross-feed **Incidents** using a
hazard-type + time-window + geo-proximity matching rule — never trusting a
shared identifier, since none exists reliably across all three feeds. Each
Incident is labeled with a **confidence tier** describing exactly how it
was corroborated (a single sensor, a shared sensor heard twice, or
independent humanitarian confirmation). A single sitrep is published to
`dashboard.html` at 08:30 Singapore time — one line per real disaster, not
per feed row — that stays silent only when it has positively confirmed
nothing changed, and speaks up explicitly, as an **erratum**, whenever
something it already reported turns out to have been wrong.

## User Stories

1. As a duty officer, I want each real-world disaster reported once, so
   that I don't mistake a mainshock and its aftershocks for dozens of
   separate earthquakes.
2. As a duty officer, I want every Incident labeled with how it was
   corroborated, so that I know whether to trust a line before acting on
   it.
3. As a duty officer, I want a GDACS+USGS earthquake match labeled
   "shared-sensor" rather than "corroborated," so that I don't mistake one
   sensor network heard twice for independent confirmation.
4. As a duty officer, I want a ReliefWeb-confirmed Incident to carry a
   distinctly stronger label than an instrument-only one, so that I can
   prioritize verified humanitarian crises.
5. As a duty officer, I want the sitrep sorted by severity with confidence
   shown as a label, not used to filter entries, so that a real
   single-source event is never hidden.
6. As a duty officer, I want the impact estimate for an Incident to show
   every available feed's number, each labeled by source, so that I don't
   mistake one model's guess for a settled fact.
7. As a duty officer, I want to be told when a feed hasn't been reached,
   even after a single missed fetch, so that I can tell a quiet morning
   from a blind one.
8. As a duty officer, I want to see how long each feed has been
   unreachable, so that I can judge how much to trust the report's
   silence.
9. As a duty officer, I want to be told explicitly when a previously
   reported Incident turns out to be wrong (a mis-merge, a deletion, a
   corrected magnitude), so that I don't keep acting on information I've
   already been told is stale.
10. As a duty officer, I want an erratum visually distinct from a new or
    escalated Incident, so that a quick scan doesn't mistake a correction
    for a new alert.
11. As a duty officer, I want two Incidents that were wrongly merged to be
    split apart once the mistake is caught, so that unrelated disasters
    stop being reported as one.
12. As a duty officer, I want a late-arriving GLIDE number to upgrade an
    Incident's confidence retroactively, so that yesterday's "unconfirmed"
    entry is corrected once humanitarian confirmation exists.
13. As a duty officer, I want cyclones, floods, volcanoes, droughts, and
    wildfires covered, not just earthquakes, so that the sitrep is useful
    for the full range of disasters GDACS tracks.
14. As a duty officer, I want ReliefWeb-only crises with no instrument
    equivalent (disease outbreaks, hailstorms) still reported, so that
    humanitarian crises outside GDACS/USGS's coverage aren't invisible.
15. As a duty officer, I want an ongoing hazard like a wildfire to stay
    open in the sitrep for as long as its source feed considers it active,
    so that a month-long fire isn't dropped or re-reported as new every
    day.
16. As a duty officer, I want an earthquake Incident to close after a
    quiet period with no new aftershocks, so that a settled sequence
    doesn't linger in the report indefinitely.
17. As a duty officer, I want small routine field changes (like GDACS's
    near-daily `datemodified` churn) to never generate a false
    escalation, so that the sitrep isn't dominated by noise.
18. As a duty officer, I want a genuine escalation (a worse GDACS alert
    colour, a revised magnitude, an extended cyclone track) to always show
    up, so that I don't miss a real deterioration.
19. As a duty officer, I want the sitrep to say nothing at all on a
    morning where every feed was reachable and nothing changed, so that
    I'm not paged for noise.
20. As an on-call engineer, I want raw feed responses logged verbatim, so
    that undocumented schema drift on an unversioned endpoint like GDACS's
    app API is diagnosable after the fact.
21. As an on-call engineer, I want a warning logged whenever GDACS returns
    exactly 100 features, so that a busy day's silent truncation is caught
    rather than assumed to be a complete feed.
22. As an on-call engineer, I want USGS polled every few minutes, GDACS
    hourly, and ReliefWeb a few times a day, so that the pipeline never
    hammers a feed faster than it actually updates.
23. As an on-call engineer, I want the pipeline to keep working against
    ReliefWeb's RSS feed while appname approval for the structured API is
    pending, so that an unparallelisable external dependency doesn't block
    everything else.
24. As an on-call engineer, I want every Event's full alias/id list stored,
    not just its single preferred id, so that USGS's network-switching id
    (and any similar GDACS instability) doesn't cause the same event to be
    double-counted.
25. As an on-call engineer, I want matching windows and geo radii
    configurable per hazard type, so that an earthquake's tight footprint
    and a cyclone's sprawling track aren't forced through the same rule.
26. As an on-call engineer, I want Incident membership re-checked against
    the matching rule on every run, not only when a new contradicting
    signal arrives, so that mis-merges are caught even without an external
    trigger.

## Implementation Decisions

- **Matching rule** — hazard type + time window + geographic proximity,
  with parameters set per hazard type (Earthquake and Cyclone tuned first,
  a conservative default elsewhere). GLIDE is used only as a late
  confirmation signal on an already-matched Incident, never as the match
  key. GDACS matching operates at Event granularity — Episodes are
  revisions within an Event, never separate match candidates. Both USGS
  (`id`/`ids`) and GDACS (`eventid`) are treated as unstable identifiers
  and matched on alias-set intersection rather than a single id field.
  Aftershock aggregation reuses the same per-hazard-type window: any
  earthquake Event inside a tracked Incident's window rolls in, with no
  magnitude floor. *(ADR 0001)*
- **Confidence tier** — a fixed five-value enum: `single-source (USGS)`,
  `single-source (GDACS)`, `shared-sensor (USGS+GDACS)`,
  `humanitarian-confirmed (ReliefWeb only)`, `humanitarian+instrument
  (ReliefWeb plus USGS and/or GDACS)`. The top tier does not further split
  shared-sensor from independent-instrument corroboration once ReliefWeb
  is present. The label is shown on every Incident but never used to
  filter or reorder — the sitrep sorts by severity only. *(ADR 0002)*
- **State-machine change taxonomy** — transitions (new / escalated /
  de-escalated / revised / closed / deleted) are driven by a fixed field
  allowlist per hazard type (alert colour, magnitude, affected-population
  estimate — diffed per source feed, never a merged number — and
  todate/extent). Any other field change, including GDACS's
  near-universal-daily `datemodified`, is churn and never triggers a
  transition. Closing is hazard-type-specific: earthquakes close after a
  fixed post-aftershock quiet period; ongoing hazards close when their
  source feed marks them non-current or drops them. Each hazard type has
  exactly one closing-authority feed; other matched feeds' signals are
  shown as context, not used to block closure. *(ADR 0003)*
- **Published-Incident corrections** — un-merging and re-merging are
  supported; Incident membership is re-evaluated against the matching rule
  on every run, not only on an explicit contradicting signal. Every
  un-merge, re-merge, retroactive GLIDE relabel, and USGS revision/deletion
  of an already-published Event is surfaced as an explicit erratum —
  never a silent correction. Late-arriving GLIDE relabels an Incident's
  confidence tier retroactively. *(ADR 0004)*
- **Impact-estimate attribution** — impact/exposure estimates are never
  collapsed into one number. Every available feed's estimate is shown,
  explicitly labeled by source. *(ADR 0005)*
- **Feed ingestion parameters** — USGS: `4.5_day` magnitude floor triggers
  new Incidents; `all_day` is additionally pulled for aftershocks within an
  already-tracked Incident's window. GDACS: accept the ~100-feature cap on
  `EVENTS4APP` for Day 1, with a logged warning whenever a response returns
  exactly 100 features. ReliefWeb: ingest via RSS (no appname approval
  required) rather than blocking on the structured API. *(ADR 0006)*
- **Feed health and polling** — a per-feed last-successful-fetch line is
  shown on every stale fetch, not after N consecutive misses. Polling
  cadence matches each feed's own latency tier: minutes for USGS, hourly
  for GDACS, a few times a day for ReliefWeb. *(ADR 0007)*
- **Hazard-type taxonomy** — canonicalized on GDACS's `eventtype` enum
  (Earthquake, Cyclone, Flood, Volcano, Drought, Wildfire) plus a catch-all
  `Other` for ReliefWeb-only hazards with no GDACS equivalent. `Other`
  Incidents are always single-source and never cross-matched. USGS Events
  whose `type` isn't `earthquake` are filtered out before matching.
  *(ADR 0008)*
- **Domain vocabulary** — the fused cross-feed unit is an **Incident**; a
  single feed's raw row is an **Event** (matching each feed's own field
  names, e.g. USGS/GDACS "event"); a GDACS Event's internal revision is an
  **Episode**. See `CONTEXT.md`.

## Testing Decisions

- **Seam:** raw feed fixture payloads in, rendered sitrep content (or the
  Incident list behind it) out. Ingestion, matching, the state machine,
  and rendering are exercised together as one black box rather than as
  separate per-module seams — confirmed with the user as the highest,
  fewest-seam option available given there's no existing codebase to
  respect prior seams from.
- **What makes a good test here:** assert on the sitrep's/Incident list's
  observable content — which Incidents appear, their confidence tier,
  their state, their erratum lines — never on internal intermediate
  representations, so tests survive refactors of the fusion internals.
- **Amended once Shape A was selected (`SHAPING.md`):** Shape A includes
  an LLM narrative pass (A5) that phrases each Incident's prose — wording
  that can vary run to run on identical input even though the underlying
  facts don't. The **primary** assertion target is therefore the Incident
  list itself (A3's output: hazard type, confidence tier, state,
  per-source impact estimates, erratum flags — all fully deterministic),
  not the rendered HTML text. A5's prose is checked only for structural
  properties (e.g. "contains no figure absent from the source estimates"
  — a direct test of ADR 0005/R5), never an exact string match. Logged as
  `QUESTIONS.md` M1.
- **Fixtures:** the example payloads already captured in `feeds/usgs.md`,
  `feeds/gdacs.md`, and `feeds/reliefweb.md` are the seed fixtures for
  single-feed cases. The Venezuela mainshock + aftershocks + GDACS
  episodes + ReliefWeb writeup sequence (`feeds/README.md` finding 2) is
  the canonical multi-Event, multi-feed aggregation fixture.
- **Priority coverage:** a GDACS+USGS earthquake pair producing
  `shared-sensor` — never `humanitarian+instrument` or a plain
  "corroborated" label — is the single most important behavior to lock
  down, since it's the one naive implementations get wrong by default and
  the whole reason ADR 0002 exists.
- **Prior art:** none — this is a greenfield repo with no existing test
  suite. The fixture-driven, single-seam approach above should become the
  pattern later feature tests follow, starting from Slice 1.

## Out of Scope

- **A general-purpose entity-resolution library.** Matching stays
  hardcoded to these three feeds' known shapes, not built for arbitrary
  future feeds.
- **Real-time / sub-minute latency.** USGS, the fastest feed, still
  updates on minute-scale; the product runs on a daily 08:30 cadence, not
  a stream.
- **GDACS pagination past the ~100-feature cap.** Accepted for Day 1 with
  a truncation-risk log line, not solved. *(ADR 0006)*
- **ReliefWeb's structured API.** Building on RSS only for now; the switch
  is expected future work, not a corner case. *(ADR 0006)*
- **Tuned matching windows beyond Earthquake and Cyclone.** Flood,
  Volcano, Drought, Wildfire, and Other run on a conservative default
  until real data justifies tuning them. *(ADR 0001)*
- **A 6th confidence tier** splitting shared-sensor from independent
  instrument corroboration once ReliefWeb is also involved — deliberately
  collapsed into one tier. *(ADR 0002)*

## Further Notes

- This PRD was produced by `/to-prd`, which is meant to synthesize from
  the current conversation without a new interview — all decisions above
  trace to `docs/adr/0001`–`0008` and `QUESTIONS.md` from the prior
  `/grill-with-docs` session, not to new judgment calls, with one
  exception: the test seam, which the skill's own process requires
  confirming with the user, and which was confirmed above.
- `to-prd` normally publishes to a project issue tracker with a
  `ready-for-agent` triage label. That step was skipped — no issue tracker
  or triage vocabulary is configured for this repo (`/setup-matt-pocock-skills`
  hasn't been run). This file at `docs/PRD.md` is the output instead, per
  `.claude/skills/build-plan-product/assets/process-plan-product.md`'s own
  expected-output list.
- This file replaces the earlier, lighter `docs/PRD.md` draft (Goal /
  Vertical Slices / Data Model / Out of Scope) written for a one-off HTML
  PRD artifact — that structure wasn't the `to-prd` template. The vertical
  slice cut proposed there (single-feed pipeline → earthquake fusion →
  full corroboration) was speculative at the time; it's since been
  re-derived properly against Shape A's actual breadboard and confirmed in
  `SLICES.md` (V1/V2/V3), which is now the authoritative slice definition
  — refer there, not to this note, for what each slice actually includes.
