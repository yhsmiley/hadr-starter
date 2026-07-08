# Show every available impact estimate, labeled by source, never collapsed

No feed answers "who is affected" directly (`feeds/README.md` finding 4):
USGS gives hazard physics (and its humanitarian-relevant PAGER `alert` field
is null on almost every event), GDACS gives a modeled exposure colour,
ReliefWeb gives a verified narrative weeks later. At 08:30, whatever impact
line the sitrep shows is always somebody's estimate, never a fact.

Decision: when more than one feed has an impact/exposure estimate for the
same Incident, the sitrep shows **all available estimates side by side,
each explicitly labeled by its source** — it never collapses them into one
picked-by-priority number.

## Consequences

The sitrep entry format needs room for multiple labeled impact lines per
Incident instead of one impact field — this is a bigger layout commitment
than a single-number design, made deliberately to avoid implying false
precision.
