# Feed health lines and per-feed polling cadence

A morning with no events and a morning where a feed was down produce the
same empty diff (`feeds/README.md` finding 6) — silence is untrustworthy
unless the sitrep itself proves each feed was actually reachable. GDACS and
ReliefWeb also publish no documented rate limits or SLA, so polling cadence
is a judgment call, not a spec.

Decision: the sitrep carries a health line per feed showing when it was
last successfully reached, and this is shown on **every** stale fetch —
even a single missed fetch before the 08:30 run — rather than waiting for N
consecutive misses, since a single miss right before publication is exactly
the failure mode finding 6 describes. Polling cadence matches each feed's
own latency tier (`feeds/README.md` finding 8) instead of one fixed
interval for all three: USGS every few minutes (detection-tier), GDACS
hourly (triage-tier), ReliefWeb RSS a few times a day (confirmation-tier).

## Consequences

A transient single-fetch blip now always produces a visible (if brief)
health warning rather than being silently tolerated — accepted as the
correct trade-off given the alternative is a "blind" morning presenting as
"quiet."

## Amendment (shaping phase, `SHAPING.md`)

This ADR's per-feed cadence was originally written assuming multiple
fetches per feed per day — but the selected architecture (Shape A) runs
its main pipeline once daily at 08:30 SGT, which on its own can only catch
an outage up to ~24h late, not within "a few minutes" of it happening.
Rather than water this ADR down to a ceiling ("no faster than X") that a
single daily fetch trivially satisfies without ever exercising, the
per-feed cadence is honored literally: three **separate, lightweight
intraday health-check jobs** (one per feed, each on its own cadence — see
`SHAPING.md`'s A7) run independently of the once-daily fusion/publish run.
Each one only pings its feed and records success/failure — no fusion, no
Incident processing. The once-daily run reads their results at render
time to build the feed-health block. This keeps the original cadence
intent intact without turning the whole pipeline into a streaming system
(REQS.md's real-time exclusion is about the *report*, not about whether a
feed check can happen more than once a day).
