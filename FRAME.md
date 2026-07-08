---
shaping: true
---

# HADR Monitor — Frame

## Source

From `README.md` ("The end state"), the fixed brief this project starts
from:

> By Wednesday afternoon this repository contains an agent that:
>
> - watches live disaster feeds — GDACS, USGS and ReliefWeb (see `feeds/`)
> - filters out the noise and assesses what remains: what happened, where,
>   how bad, who is affected
> - publishes a morning situation report to `dashboard.html` at 08:30
>   Singapore time
> - runs on a schedule, unattended, and stays quiet when nothing has
>   changed

From `REQS.md`, the idea layered on top of that brief:

> The three feeds are not independent witnesses to the same events —
> they're a sensor, a triage layer, and a confirmation layer arriving at
> different speeds, with no shared key (see `feeds/README.md`, findings
> 1–3). Most naive implementations will either treat feed rows as
> already-matched events (and double-report the same earthquake three
> times under three IDs) or bolt on ad hoc dedup that silently drops real
> corroboration.
>
> So: make the matching/fusion step the centerpiece, not an afterthought.
> The sitrep's unit is "the disaster" (a fused record), not a raw feed
> row.

From `feeds/README.md` (cross-feed finding 6), the failure mode that
motivates the health/honesty side of the problem:

> "Quiet" and "blind" look identical. A morning with no events and a
> morning where a feed was down produce the same empty diff. The sitrep
> must carry feed-health lines ... or its silence is untrustworthy.

## Problem

A responder or planner needs to know, as early and accurately as
possible, what happened, where, how severe it is, and who is affected.
Doing this by manually cross-referencing GDACS, USGS, and ReliefWeb is
unreliable in two specific ways that a naive automated pipeline inherits
rather than fixes:

1. **No shared key exists across the three feeds.** GLIDE, the one
   cross-agency identifier, arrives late and is empty on ~98% of GDACS
   events; every other ID is per-source and USGS's own `id` is unstable.
   A pipeline that treats each feed's rows as pre-matched events either
   reports the same earthquake three times under three names, or bolts on
   dedup that silently drops real cross-feed corroboration — the failure
   modes are opposite, but a naive implementation tends to hit one of
   them.
2. **The feeds are not independent, and don't say so.** Every GDACS
   earthquake sources from NEIC, the same origin as USGS — agreement
   between them is one sensor network heard twice, not two witnesses. A
   pipeline (or a human) that treats any 2-feed agreement as "corroborated"
   overstates confidence on the single most common case.
3. **Silence is ambiguous.** A morning with nothing to report and a
   morning where a feed silently went down produce the same empty output,
   so the sitrep's quiet mornings can't be trusted without an independent
   health signal.

The work this repository has already put into `feeds/*.md` (endpoint
verification, live findings, timestamp conventions) establishes *what the
feeds actually do*. It does not yet establish *how their rows become one
trustworthy daily report* — that's the problem this shaping process is
for.

## Outcome

Success is a daily 08:30 SGT sitrep where:

- **Each real-world disaster appears once**, regardless of how many rows
  or how many feeds reported it.
- **Every entry is honest about its own confidence** — a reader can tell
  a single unconfirmed sensor hit from an independently corroborated one
  without reading the feeds themselves.
- **Silence means "checked and nothing changed,"** never "a feed was
  unreachable and we don't know." The two are always visibly different.
- **Being wrong is recoverable and visible.** When a match, a magnitude,
  or a merge later turns out incorrect, the next sitrep says so
  explicitly rather than silently drifting to the corrected state.

This outcome is deliberately solution-agnostic — it doesn't presume the
matching algorithm, the storage shape, or the rendering approach. Those
are what the Shaping doc (R × Shapes) works out next, starting from
`docs/PRD.md`'s Implementation Decisions and `CONTEXT.md`'s vocabulary as
scaffolding, not as a shape already chosen.
