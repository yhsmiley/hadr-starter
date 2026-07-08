# HADR Monitor

A monitoring agent that watches disaster feeds (GDACS, USGS, ReliefWeb),
fuses their rows into one record per real-world disaster, and publishes a
daily sitrep. See `README.md` for the end state and `feeds/README.md` for
the cross-feed findings this glossary is built from.

## Language

**Incident**:
The fused, cross-feed unit — the thing the sitrep actually reports on. Built
by matching and aggregating one or more Events (possibly from different
feeds, possibly many from the same feed, e.g. a mainshock plus its
aftershocks) that represent the same real-world disaster.
_Avoid_: Disaster, fused disaster, disaster record — reserve "disaster" for
plain-English use in docs, not as the canonical entity name, since it also
appears as ReliefWeb's own record-type name and would be ambiguous.

**Event**:
A single row from a single feed's API — one USGS earthquake entry, one GDACS
event, one ReliefWeb RSS item. Matches each feed's own terminology
(`feeds/usgs.md`, `feeds/gdacs.md`, `feeds/reliefweb.md`) directly, so no
translation layer is needed between this glossary and the feed docs. An
Event on its own is unconfirmed; it becomes part of an Incident once matched.
_Avoid_: Observation, signal, row (as the canonical noun in docs/ADRs —
"row" is fine informally when talking about raw API payloads).

**Episode** (GDACS Events only):
A revision within a single GDACS Event, not a separate Event. GDACS's own
colour can disagree between the parent Event and its current Episode (see
ADR 0001) — Incident-matching operates on the Event, never the Episode.

**Confidence tier**:
The label on an Incident answering "should I trust this line" — one of a
fixed five-value enum driven by which feeds corroborated it and whether
that corroboration was independent or a shared sensor (see ADR 0002). Shown
on every Incident; never used to filter or reorder the sitrep.
_Avoid_: Corroboration level, trust score — the tier is a fixed label, not
a computed score.

**Hazard type**:
The classifier that drives per-type matching windows (ADR 0001), change
allowlists, and closing rules (ADR 0003): `Earthquake`, `Cyclone`, `Flood`,
`Volcano`, `Drought`, `Wildfire` — GDACS's own `eventtype` enum — plus a
catch-all `Other` for anything with no GDACS-equivalent type (ReliefWeb
disease outbreaks, hailstorms, etc.). `Other` Incidents are always
single-source and never cross-matched (see ADR 0008). USGS Events whose
`type` isn't `earthquake` (explosions, quarry blasts, ice quakes) are
filtered out before matching — they never become Incidents at all.

**Erratum**:
A sitrep line that corrects something a previous sitrep already reported —
an un-merge/re-merge, a retroactive confidence-tier relabel from late
GLIDE, or a revision/deletion of an already-published Event (see ADR 0004).
Always shown explicitly, never as a silent correction, and visually
distinct from a new or escalated Incident entry.
