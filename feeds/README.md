# Feeds

One doc per source: endpoint, example response, verified findings, open
questions. This file holds what cuts across all three.

## Cross-feed findings (verified 7 Jul 2026)

1. **Entity resolution has no free key.** GLIDE is the designed cross-agency
   identifier, but it arrives late and sparsely (empty on 98/100 GDACS events;
   reliable only on ReliefWeb). Every other ID is per-source, and USGS's `id`
   is itself unstable. Practical matching is type + time window + geographic
   proximity, with GLIDE as late confirmation.
2. **There is an aggregation layer above matching.** The Venezuela earthquakes
   of 24 Jun 2026 are two mainshocks plus aftershocks: hundreds of USGS rows,
   a handful of GDACS episodes, one ReliefWeb disaster. The unit of reporting
   is "the disaster", and none of the feeds hands it to us — we construct it.
3. **The feeds are not independent.** Every GDACS earthquake today sources
   from NEIC, the agency behind the USGS feed. Agreement between GDACS and
   USGS on a quake is one sensor network heard twice, not two witnesses.
4. **No feed answers "who is affected".** USGS gives hazard physics; GDACS
   gives a modeled exposure estimate (its colours); ReliefWeb gives verified
   narrative weeks later. At 08:30 the impact line is always an estimate —
   decide whose estimate we quote and label it.
5. **All three are mutable snapshots, so change detection needs a per-event
   state machine**, persisted between runs: new → escalated → de-escalated →
   revised → closed → deleted. A diff of two fetches cannot express most of
   those transitions.
6. **"Quiet" and "blind" look identical.** A morning with no events and a
   morning where a feed was down produce the same empty diff. The sitrep must
   carry feed-health lines ("GDACS last reached 07:58 SGT") or its silence is
   untrustworthy. GDACS publishes no SLA.
7. **Three feeds, three timestamp conventions**: USGS epoch milliseconds UTC;
   GDACS naive ISO strings that are UTC but unmarked; ReliefWeb RSS RFC-822
   dates pinned to 00:00. Normalise to UTC at ingest, convert to
   Asia/Singapore only at render time.
8. **Latency tiers set each feed's role**: USGS minutes (detection), GDACS
   minutes-to-hours (triage — the impact colours), ReliefWeb days-to-weeks
   (confirmation and narrative). A pipeline that treats them as peers will
   either be late or wrong.

## Decisions these force (write them down before prompting for code)

- What makes two records the same disaster (the matching rule).
- Which GDACS colour field is authoritative for the sitrep.
- Which changes are report-worthy vs churn (the change taxonomy).
- Which USGS window and magnitude floor we ingest.
- How per-event state persists between runs.
- What the report says when a feed is unreachable.
