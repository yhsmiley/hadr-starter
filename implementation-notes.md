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
