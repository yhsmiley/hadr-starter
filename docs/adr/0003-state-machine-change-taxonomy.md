# State machine change taxonomy and closing rule

Every Incident persists between runs through a state machine (new →
escalated → de-escalated → revised → closed → deleted, per
`feeds/README.md` finding 5), because a diff of two fetches can't express
most of those transitions on its own. But GDACS's `datemodified` changes on
87 of 100 events on a typical day (`feeds/gdacs.md` finding 3) — if any
detected field change counted as a transition, the sitrep would be
dominated by churn.

Decision: transitions are driven by a **fixed field allowlist per hazard
type** — alert colour, magnitude, affected-population estimate, and
todate/extent are the fields that can trigger escalated/de-escalated/
revised. Any other field change (timestamps like `datemodified`, metadata)
is churn and never triggers a transition. Consistent with ADR 0005 (no
canonical merged impact estimate), the affected-population field is diffed
**per source feed**, not as one combined number — any single feed's own
estimate changing is itself a valid transition trigger for that Incident.

Closing is likewise **hazard-type-specific**, not one fixed quiet period for
everything: an earthquake Incident closes after a fixed quiet period with no
new aftershock; ongoing hazards (wildfire, flood, drought) close when the
source feed itself marks the event non-current (GDACS `iscurrent: false`)
or drops it from the feed, since these can legitimately stay open for
months. Each hazard type has exactly one **closing-authority feed** — the
one named above — and its signal decides closure regardless of what any
other matched feed on the same Incident says. A matched ReliefWeb record
still marked `ongoing` after its closing-authority feed has closed the
Incident is shown in the sitrep as informational context, not treated as a
reason to keep the Incident open.

## Consequences

The allowlist must be revisited whenever a new hazard type is added to the
per-hazard-type matching parameters from ADR 0001 — a hazard type with no
allowlist entry would either transition on everything (noise) or nothing
(missed real changes).
