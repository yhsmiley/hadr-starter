# Implementation notes

Kept by the agent, reviewed by you. One entry per working block.

## Decisions

- **2026-07-08 — V1 build (Slice 1, `SLICES.md`).** Built the single-feed
  USGS pipeline: ingest, fusion engine, JSON state store, narration,
  HTML renderer, plus the two GitHub Actions workflows (daily sitrep +
  intraday USGS health check). Stack chosen: Node/TypeScript, `tsc`-only
  build, no test framework (see `CLAUDE.md`).
- **Concrete matching parameters (ADR 0001 left these as "per-hazard-type
  parameters" without numbers):** Earthquake sequence window = 30 days
  rolling from the most recent known member event; geo radius = 150 km.
  Chosen as reasonable defaults for an aftershock zone, not derived from
  data — revisit once real sequences are observed over time. The same 30
  days is reused as the earthquake closing-rule quiet period (ADR 0001's
  own aggregation window), and doubled (60 days total from last activity)
  as the point at which a closed Incident is pruned from `incidents.json`
  entirely, so the state file doesn't grow forever.
- **A5 (narration) is a Claude Code skill, not a direct SDK call —
  revised mid-build.** Originally wrote `src/narrate/narrate.ts` as a
  direct `@anthropic-ai/sdk` call. Partway through, found
  `.github/workflows/sitrep.yml.disabled`, a pre-existing placeholder in
  this repo specifying exactly this shape: "a deterministic script decides
  whether anything changed; a headless model call runs only if it did...
  Headless Claude (`claude -p`) runs your /sitrep skill." Combined with
  README.md's explicit "at least one skill" deliverable, this meant the
  SDK approach was the wrong mechanism even though it satisfied Shape A's
  principle (deterministic fusion, LLM only narrates). Asked the user;
  they chose to convert. Final shape: `scripts/sitrep.ts` does ingestion
  + fusion + a first deterministic render pass (using whatever narratives
  already exist), then writes a `needs_narration` step output. Only if
  that's `true` does `.github/workflows/sitrep.yml` invoke
  `anthropics/claude-code-action` (this repo's existing convention for
  headless Claude, already used by `claude.yml`/`claude-code-review.yml`)
  running `/sitrep` (`skills/sitrep/SKILL.md`), which narrates pending
  Incidents and calls `npm run render` to regenerate `dashboard.html`
  deterministically from the result. `@anthropic-ai/sdk` was removed —
  this codebase has zero runtime dependencies now, and zero credential
  requirements for local development (the skill only runs in CI).
  Persisting this required adding a `narrative: string | null` field to
  `Incident` (`src/types.ts`): `null` means "awaiting narration," set on
  every new Incident and invalidated back to `null` on any
  escalation/revision so stale prose never lingers; `closed` Incidents
  never touch this field at all — the renderer narrates them with a fixed
  string, no model call needed for that case.
- **Magnitude vs. impact:** per `feeds/usgs.md` finding 5 ("magnitude is
  not impact"), magnitude is treated as a hazard-physics fact and is
  included in what A5 narrates. Only the PAGER `alert` field is treated as
  an impact estimate (ADR 0005) and is excluded from A5's input entirely,
  rendered directly by `src/render/dashboard.ts` instead.

- **2026-07-08 — V2 build (Slice 2, `SLICES.md`).** Added the GDACS
  earthquake adapter and turned on real cross-feed matching. The core
  matching engine (`src/fusion/match.ts`) needed **zero changes** -- it
  was already written generically over `FeedEvent.feed`, not hardcoded to
  USGS, so cross-feed matching (time/geo window only, since USGS and
  GDACS ids can never overlap) worked the first time it was exercised.
  Three real decisions this build needed that weren't fully pinned down
  upstream, logged in full as `QUESTIONS.md` O1-O3:
  - GDACS's own open question ("`alertlevel` or `episodealertlevel`?")
    was never actually resolved by any ADR -- resolved to `alertlevel`
    (event-level), matching ADR 0001's own Event-granularity principle.
  - Magnitude-change vs. colour-change precedence when both change in the
    same refetch: magnitude wins (always "revised" + erratum), since a
    factual correction is more consequential than a severity update.
  - GDACS's list endpoint has no numeric magnitude field for earthquakes
    -- parsed out of `htmldescription` free text with a regex. A real,
    acknowledged dependency on GDACS's undocumented prose format staying
    stable (`feeds/gdacs.md` finding 4's "no version contract" warning
    applies doubly here).
  Also extended: `Incident.impactEstimates` now shows USGS PAGER alert
  and GDACS's colour side by side when both exist (never blended, ADR
  0005); `assignConfidenceTier` does real feed-composition logic instead
  of a hardcoded return; a second intraday health-check workflow
  (`health-check-gdacs.yml`) on GDACS's own hourly cadence, independent
  of USGS's every-few-minutes one.
- **Verified against live data:** every Incident produced by a real run
  came back `shared-sensor (USGS+GDACS)` -- confirmed with exact
  coordinate/timestamp matches that USGS and GDACS really do report the
  same earthquakes (GDACS sources from NEIC, same as USGS -- REQS.md's
  founding thesis, now demonstrated in production). Also caught GDACS's
  ~100-feature cap firing for real on a live response (ADR 0006's
  truncation-risk warning), and confirmed a genuine mainshock->aftershock
  pair 16 hours apart still aggregated correctly across both feeds.

- **2026-07-08 — V3 build (Slice 3, `SLICES.md`).** Generalized the
  pipeline past earthquake-only: the ReliefWeb RSS adapter, GDACS's full
  hazard taxonomy (Cyclone tuned, Flood/Volcano/Drought/Wildfire
  conservative default), the full 5-tier confidence enum, per-hazard-type
  closing authority, and cross-run un-merge/re-merge (ADR 0004/A3.6) —
  the last of these never actually exercised before V3 since a
  single-feed, single-hazard-type V1/V2 rarely produces a mis-merge worth
  detecting. Several genuinely open judgment calls, logged here rather
  than guessed silently:
  - **Cyclone/default matching windows** (ADR 0001 left these
    unspecified, same as Earthquake's in V1): Cyclone = 21 days / 500 km
    (tuned wider than Earthquake since GDACS's point is a coarse track
    centroid, not a track shape — `feeds/gdacs.md` finding 6); Flood/
    Volcano/Drought/Wildfire = 14 days / 100 km (ADR 0001's own
    "conservative default," expected to misfire until refined by real
    data, same caveat the ADR already logs for itself).
  - **No new-Incident magnitude floor for non-Earthquake GDACS hazard
    types.** ADR 0006's M4.5 floor exists specifically to filter USGS's
    noisy `all_day` feed; GDACS's `EVENTS4APP` is already a curated
    "significant events" list with no equivalent noise problem, so every
    incoming Cyclone/Flood/Volcano/Drought/Wildfire event is eligible to
    become a new Incident immediately.
  - **ReliefWeb has no real geometry at all** — the RSS carries only a
    country name, no coordinates. `src/ingest/countryCentroids.ts` gives
    each event a country-centroid point for *display* only; matching
    never uses it. Instead, `src/fusion/match.ts`'s `isSameOrRelated`
    branches: whenever either side of a comparison is a ReliefWeb event,
    it matches by GLIDE equality or by a place-name substring check
    within a 45-day confirmation window (`feeds/reliefweb.md` finding 2:
    latency is days to weeks), never by haversine distance. This is
    coarser than instrument-to-instrument matching by construction — two
    unrelated ReliefWeb records of the *same* hazard type in the *same*
    country within 45 days of each other would incorrectly merge. Fixing
    this for real needs ReliefWeb's structured API (real geometry, ISO3
    codes), out of scope per ADR 0006's RSS-only decision.
  - **Hazard type derivation for ReliefWeb** (not specified by any ADR):
    GLIDE's own 2-letter prefix first (shares GDACS's eventtype letters
    for the six recognized types), falling back to a title keyword match,
    falling back to `Other`. Whichever GLIDE prefixes exist beyond the
    six ADR 0008 recognizes (e.g. `EP` epidemic, `LS` landslide) correctly
    fall through to `Other` today — this list was not exhaustively
    verified against GLIDE's real registry, only against what
    `feeds/reliefweb.md`'s own example carries.
  - **ReliefWeb contributes no `impactEstimates` line.** ADR 0005 wants
    every available impact estimate shown per-source, but the RSS (unlike
    the structured API) carries no structured affected-population figure
    — only free-text prose. Rather than parse an unstructured number out
    of prose text with false precision, ReliefWeb's contribution stays
    the confidence-tier upgrade alone, which ADR 0002 already treats as
    the strongest available signal in its own right.
  - **`todate`/"extent" field changes and GDACS affected-population
    diffing are not implemented as transition triggers**, even though
    ADR 0003's allowlist names both. GDACS's list endpoint (the only
    GDACS data this codebase ingests, per ADR 0006) exposes no
    affected-population field at all — that lives behind per-event
    `url.details`, never fetched. Treating `todate` extension as a
    transition would also likely reintroduce the exact `datemodified`
    churn problem ADR 0003 exists to prevent, since ongoing hazards
    extend `todate` by routine daily rollover (`feeds/gdacs.md` finding
    5), not just on a real extent change. Alert colour and magnitude
    remain the only two implemented triggers.
  - **`Other` and any Incident with no GDACS member yet have no closing
    authority under RSS-only ingestion.** ADR 0003 requires exactly one
    closing-authority feed per hazard type; for `Other` that would have
    to be ReliefWeb itself, but the RSS carries no `status` field (only
    the structured API's `alert`/`ongoing`/`past` does, per
    `feeds/reliefweb.md` finding 3). These Incidents persist until an
    instrument member eventually arrives (upgrading them out of this gap)
    or a human intervenes — never auto-close, logged as an open question
    below rather than guessed.
  - **Severity sorting/display for non-Earthquake hazard types** (caught
    by actually rendering V3's live output, not by the numbers compiling):
    `src/render/dashboard.ts`'s severity sort and the header's `M x.x`
    badge both assumed every Incident has a magnitude. Fixed two ways:
    the header now shows the hazard type name instead of a fabricated
    "M 0.0" when no member has a magnitude; the sort itself falls back to
    a GDACS-alert-level proxy (Green=2, Orange=5, Red=8) so a Red-alert
    wildfire doesn't silently rank as "0 severity" behind every
    earthquake. The two scales aren't truly commensurable — a judgment
    call, not a spec, since no ADR defines cross-hazard-type severity.
  - **"Dropped from the feed" as a closing trigger can't distinguish a
    genuinely-ended event from one that merely aged out of GDACS's
    ~100-feature cap** (the same truncation risk ADR 0006 already flags).
    A busy day could cause a false early closure. Accepted as the
    best-available signal given the list endpoint's own limitation, not
    silently assumed safe.

## Open questions

- **USGS deletion detection is not implemented**, despite SLICES.md V1
  listing "erratum for USGS revision/deletion" as live. `feeds/usgs.md`
  finding 1 already flags why: the summary GeoJSON feeds (`4.5_day`,
  `all_day`) are rolling windows — an event that ages out of the window
  and an event that was genuinely deleted are indistinguishable from these
  endpoints alone. Detecting real deletions reliably would need the FDSN
  query API (`feeds/usgs.md`'s "canonical store"), which ADR 0006 never
  scoped in. **Revision** detection (a member event refetched with a
  changed magnitude) is fully implemented and tested; deletion is not.
  This should go back to `QUESTIONS.md`/an ADR amendment before V2, not
  stay a silent gap.
- **Raw payload log growth** (`state/raw/usgs-<date>.json`, ~300KB/day from
  today's live run): committing one file per day indefinitely will add
  roughly 100MB/year to the repo. No retention/pruning implemented. Given
  A2.4 exists specifically for diagnosing schema drift on an *undocumented*
  endpoint, and USGS's endpoint is versioned and documented (unlike
  GDACS's, which is what A2.4 was really motivated by per `feeds/gdacs.md`
  finding 4), it may be reasonable to drop USGS raw logging entirely, or
  retain only N days. Not decided — flagging rather than guessing.
- **Commit volume from A7:** the USGS health-check workflow runs every 5
  minutes (288 commits/day if the health status actually changes that
  often, fewer if `git diff --cached --quiet` finds nothing new). This is
  what SHAPING.md's A7 design and the user's own choice (fidelity over
  simplicity, see `QUESTIONS.md` M2) call for, but it's worth knowing
  going in — this is a much chattier commit history than the once-daily
  sitrep alone would produce.
- **`Other`-hazard and instrument-less Incidents never auto-close** (V3).
  ADR 0003 requires a closing-authority feed per hazard type; ReliefWeb's
  RSS carries no status field to act as one (only the structured API
  does). These Incidents persist in `incidents.json` indefinitely unless
  an instrument member later arrives. Needs an ADR amendment or a
  decision to migrate ReliefWeb ingestion to the structured API before
  this is a real gap worth closing, not a silent guess.
- **ReliefWeb place-name matching can false-merge** two unrelated,
  same-hazard-type, same-country disasters within its 45-day confirmation
  window, since the RSS gives no real geometry to disambiguate them. Not
  observed in the small amount of live data checked so far, but a known,
  documented risk of the RSS-only decision (ADR 0006) rather than
  something the code silently assumes away.

## Deviations

- **ADR 0006 said "`all_day` filtered to existing tracked Incidents'
  windows for aftershocks"** — implemented differently: `src/ingest/usgs.ts`
  fetches both `4.5_day` and `all_day` in full (deduped by id, filtered to
  `type: earthquake`) with no incident-aware filtering at ingest time.
  The window/floor logic that ADR 0006 describes is instead enforced
  entirely inside `src/fusion/fuse.ts` (a sub-floor Event can only join an
  existing Incident, never spawn a new one). Same observable behavior,
  but the decision now lives in one place (the fusion engine, which
  already computes the per-hazard-type window for matching) instead of
  being duplicated between ingestion and fusion. Chose this to avoid two
  copies of the same window logic silently drifting apart.
