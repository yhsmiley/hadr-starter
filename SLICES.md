---
shaping: true
---

# HADR Monitor — Slices

Ground truth for slice definitions is here; Shape A's full mechanism
definitions stay in `SHAPING.md` (Detail A) — this doc says which of
those parts are live, degenerate, or dormant in each slice, and what each
slice actually shows on `dashboard.html`. Per the `shaping` skill: every
slice must end in demo-able UI. For this product that means a real,
openable `dashboard.html` showing real fused data for that slice's scope —
not backend logic with nothing to look at.

**A scheduling note carried over from Detail A:** A1 fires the full
fusion/publish pipeline once daily at 00:30 UTC / 08:30 SGT in every
slice below. Feed outage detection runs on a **separate** schedule: each
feed gets its own intraday health-check job (A7), polling at its own
cadence per ADR 0007 (USGS every few minutes, GDACS hourly, ReliefWeb a
few times a day) and writing only to its own health file — never touching
Incidents or running fusion. A7 jobs roll out per feed exactly when that
feed's ingestion adapter (A2.x) does, one slice at a time, below.

## V1 — Single-feed pipeline (USGS earthquakes)

**Scope:** prove the whole shape end to end — trigger, ingest, fuse,
narrate, render, commit — before cross-feed matching adds any real
complexity. One feed, one hazard type.

**Live parts:** A1.1–A1.2 (full) · A2.1 (USGS only; A2.2/A2.3 dormant) ·
A2.4 (USGS payloads only) · A3.1/A3.2 (matching restricted to *within*
USGS — this is the real test: a mainshock's own aftershocks rolling into
one Incident, and USGS's own network-switching `id` not causing a false
split) · A3.4 (allowlist restricted to magnitude, USGS's only tunable
field) · A3.5 (earthquake closing rule) · A3.6 (re-evaluation, exercised
against USGS's own id instability) · A3.8 (erratum for USGS
revision/deletion — reachable single-feed, per ADR 0004/I1) · A4.1–A4.2
(full) · A5.1–A5.2 (full, though impact estimates are just USGS's
often-null PAGER `alert`) · A6.1–A6.2 (full) · **A7 for USGS only**
(intraday health-check job, every-few-minutes cadence; A4.3's USGS health
file is the only one that exists yet) · A7 for GDACS/ReliefWeb dormant.

**Dormant:** A2.2/A2.3 (GDACS, ReliefWeb) · A3.3 only ever resolves to
`single-source (USGS)` — the tier enum exists in the UI but is degenerate
· A3.7 (GLIDE relabeling — GLIDE only ever arrives via ReliefWeb, not
reachable) · any cross-feed matching in A3.1.

**Demo:** open `dashboard.html`, see real USGS earthquake Incidents —
mainshock + aftershocks correctly rolled into one entry, `single-source
(USGS)` on every line, one feed-health line, and a working "nothing new"
day.

| Affordance | V1 behavior |
|---|---|
| Feed-health block | 1 line (USGS) |
| Confidence tier | always `single-source (USGS)` |
| Impact estimates | USGS PAGER `alert` only, usually absent |
| Erratum marker | reachable (USGS revision/deletion only) |
| Hazard coverage | Earthquake only |

## V2 — Cross-feed fusion (USGS + GDACS earthquakes) — **BUILT**

**Scope:** the actual product thesis. Adds the second feed and turns on
real cross-feed matching, scoped to the one hazard type with the richest
verified data.

**Verified against live data:** every Incident fused during a real run
came back `shared-sensor (USGS+GDACS)` — GDACS's earthquake feed really
does mirror USGS/NEIC closely enough that same-day quakes are seen by
both. Also caught GDACS's ~100-feature cap firing for real (ADR 0006's
truncation-risk warning triggered on a live response), and confirmed a
genuine mainshock→aftershock pair 16 hours apart still aggregated
correctly into one Incident across both feeds. See
`implementation-notes.md` for the two decisions this build needed that
weren't fully pinned down in `SHAPING.md`/the ADRs.

**Newly live:** A2.2 (GDACS adapter, `eventtype=EQ` only — Cyclone and
the rest stay dormant until V3) · A3.1 fully active for cross-feed
matching, Earthquake parameters (ADR 0001) · A3.3 now reaches
`single-source (GDACS)` and `shared-sensor (USGS+GDACS)` · A3.4 allowlist
extended to GDACS alert colour · impact estimates on A6.1 now genuinely
exercised: USGS PAGER `alert` and GDACS colour shown side by side,
per-source, structurally separate from A5's prose (per the A5.2 fix) ·
**A7 for GDACS** (hourly cadence) goes live alongside its adapter.

**Still dormant:** A2.3 (ReliefWeb) · A3.7 (GLIDE) · humanitarian-tier
confidence labels · Cyclone/Flood/Volcano/Drought/Wildfire coverage.

**Demo:** the Venezuela-mainshock-style case — an earthquake seen by both
USGS and GDACS renders as one Incident labeled `shared-sensor
(USGS+GDACS)`, never as two lines and never mislabeled as independent
corroboration. Two feed-health lines. Impact estimates for the same
Incident shown from both feeds, unblended.

| Affordance | V2 behavior |
|---|---|
| Feed-health block | 2 lines (USGS, GDACS) |
| Confidence tier | `single-source (USGS)` · `single-source (GDACS)` · `shared-sensor (USGS+GDACS)` |
| Impact estimates | USGS PAGER + GDACS colour, per-source, side by side |
| Erratum marker | reachable (USGS revision/deletion, cross-feed un-merge) |
| Hazard coverage | Earthquake only |

## V3 — Full corroboration & trust

**Scope:** generalize past earthquakes, add the third feed, and turn on
every remaining ADR 0004 correction behavior across the whole system —
this is what makes the sitrep trustworthy on its worst day, not just its
best one.

**Newly live:** A2.3 (ReliefWeb RSS, GLIDE extraction, `Other` catch-all
per ADR 0008) · A2.2 extended to Cyclone (tuned) and
Flood/Volcano/Drought/Wildfire (conservative default) · A3.3 reaches the
full 5-tier enum (`humanitarian-confirmed`, `humanitarian+instrument`) ·
A3.5 per-hazard closing authority for ongoing hazards (GDACS `iscurrent`)
· A3.6 un-merge/re-merge now meaningfully exercised across all three feeds
· A3.7 GLIDE relabeling (now reachable — retroactively upgrades history)
· A3.8 full erratum scope (un-merge, re-merge, GLIDE relabel, USGS
revision/deletion, all at once) · **A7 for ReliefWeb** (a-few-times-daily
cadence) — all three intraday health-check jobs are now live.

**Nothing left dormant** — every Detail-A part from `SHAPING.md` is live.

**Demo:** a humanitarian-only crisis with no instrument equivalent (e.g.
a disease outbreak) appears correctly as `Other`, single-source,
never-cross-matched. A cyclone's track-shaped footprint matches correctly
under its own tuned window. A late GLIDE arrival visibly upgrades a
already-published Incident's confidence tier, shown as an explicit
update. Three feed-health lines, all current every run regardless of
whether anything changed (per A6.2 / ADR 0007).

| Affordance | V3 behavior |
|---|---|
| Feed-health block | 3 lines (USGS, GDACS, ReliefWeb) |
| Confidence tier | full 5-tier enum |
| Impact estimates | all 3 feeds where available, per-source |
| Erratum marker | full scope: un-merge, re-merge, GLIDE relabel, revision/deletion |
| Hazard coverage | Earthquake, Cyclone, Flood, Volcano, Drought, Wildfire, Other |

## Consistency check against SHAPING.md

Every Detail-A part (A1.1 through A7.3) is accounted for across the three
slices, and nothing appears before its dependencies: A3.7 (GLIDE) can't
go live before A2.3 (ReliefWeb, the only GLIDE source); A3.3's
humanitarian tiers can't appear before A2.3 either; cross-feed A3.1 can't
exercise real matching before a second feed (A2.2) exists; each feed's A7
health-check job rolls out in lockstep with that feed's A2.x adapter, so
the health block's feed count always matches the ingestion adapters
actually running. No slice introduces a part that isn't already fully
specified in `SHAPING.md` — slicing only sequences what detailing already
resolved, it doesn't resolve anything new.

*(This doc previously stated ADR 0007's per-feed cadence was a "ceiling"
satisfied trivially by a once-daily fetch, and treated intraday
health-checking as an out-of-scope V4+ idea. That was resolved
unilaterally without confirming with the user first — flagged during the
step-E consistency check as `QUESTIONS.md` M2, and corrected: A7 makes
ADR 0007's original per-feed cadence literally true, rolled out above.)*
