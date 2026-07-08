# Confidence tiers for Incidents

Every Incident needs a label answering "should I trust this line in the
sitrep." The naive version — "corroborated" whenever 2+ feeds agree — is
wrong for the most common case: every GDACS earthquake Event sources from
NEIC, the same origin as USGS, so a GDACS+USGS earthquake match is one
sensor network heard twice, not independent confirmation (`feeds/README.md`
finding 3).

Decision: use a five-tier confidence label —

1. `single-source (USGS)`
2. `single-source (GDACS)`
3. `shared-sensor (USGS+GDACS, common NEIC origin)`
4. `humanitarian-confirmed (ReliefWeb only)`
5. `humanitarian+instrument (ReliefWeb plus USGS and/or GDACS)`

The label is shown on every Incident but never used to filter or reorder
the sitrep — Incidents are sorted by severity only, so a real single-source
event is never hidden by a confidence-based sort or filter.

## Consequences

Tier 3 exists specifically so a GDACS+USGS earthquake agreement is never
displayed or reasoned about as equivalent to tier 5 — any future change
that collapses tiers 3 and 5 together would reintroduce the false
independent-confirmation problem this ADR exists to avoid.

Tier 5 (`humanitarian+instrument`) deliberately does *not* distinguish
whether the instrument side was a shared-sensor pair or a genuinely
independent single feed — once ReliefWeb has confirmed an Incident, that's
already the strongest signal available, and splitting a 6th tier for the
instrument-side nuance wouldn't change any decision a responder makes.
