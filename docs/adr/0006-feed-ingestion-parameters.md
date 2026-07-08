# Feed ingestion parameters for Day 1

Each feed's raw firehose is too noisy or too capped to ingest naively:
USGS's `all_day` window is 157/207 events below M2.0 (`feeds/usgs.md`
finding 4); GDACS's `EVENTS4APP` endpoint returns exactly 100 features with
no documented paging (`feeds/gdacs.md` finding 4); ReliefWeb's structured
API requires a pre-approved `appname` that takes unpredictable, unparallel-
isable time to obtain (`feeds/reliefweb.md` finding 4).

Decision, per feed:

- **USGS**: `4.5_day` is the floor for triggering a **new** Incident
  (matches GDACS's own global detection floor and filters the sub-M2.0
  noise). Once an Incident exists (mainshock tracked), aftershock rows are
  additionally pulled from `all_day` within that Incident's matching window
  (ADR 0001) so small aftershocks aren't truncated — the two windows serve
  different purposes, not one superseding the other.
- **GDACS**: accept the ~100-feature cap on `EVENTS4APP` for Day 1 — no
  general pagination workaround (out of scope per REQS.md) — but log a
  truncation-risk warning whenever a response returns exactly 100 features.
- **ReliefWeb**: build against the RSS feed now rather than blocking on
  appname approval, since approval latency can't be parallelised. The RSS's
  `pubDate` (record-creation date pinned to 00:00, not event time) is
  acceptable because ReliefWeb's role is days-later confirmation/enrichment,
  never detection — no report depends on ReliefWeb timestamp precision.

## Consequences

Switching ReliefWeb from RSS to the structured API later is expected work,
not a corner case — `feeds/reliefweb.md` finding 3 already lists what the
API adds (status, GLIDE, ISO3, the `reports` stream) that the RSS lacks.
