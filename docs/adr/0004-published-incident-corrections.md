# Corrections to already-published Incidents are always explicit

Three separate situations can make a previously-published sitrep entry
wrong after the fact: two matched Incidents turn out to be different
disasters (or the reverse); GLIDE arrives late and confirms a match; or an
underlying USGS Event is revised (magnitude correction) or deleted outright
(`feeds/usgs.md` finding 1). In every case a responder may already have
acted on the earlier sitrep.

Decision: the fusion layer supports un-merging and re-merging Incidents,
and every one of these three situations is surfaced as an **explicit
erratum line** in the next sitrep — never a silent correction. When GLIDE
arrives late on an already-matched Incident, it **relabels history**: the
Incident's confidence tier (ADR 0002) is updated retroactively, since the
label's purpose ("should I trust this line") is now more true even for
already-published entries.

Mis-merges are found by **automatic re-evaluation every run**: each
Incident's constituent Events are re-checked against the matching rule
(ADR 0001) on every fetch, not only when an explicit contradicting signal
(like a new GLIDE mismatch) happens to arrive — e.g. a later, more precise
location that moves an Event outside its Incident's geo window triggers a
split even with no other new signal.

## Consequences

The sitrep format needs a distinct visual treatment for "this corrects
something we told you before" versus a normal new/escalated entry — a
responder scanning quickly must not mistake an erratum for a new event.
