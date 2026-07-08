# QUESTIONS.md

Grilling log for the corroboration/fusion design in `REQS.md`. Questions are
logged here up front; answered ones get a `Resolved →` line and feed into
`CONTEXT.md` / `docs/adr/*.md`. New questions found mid-session get appended,
not inserted, so the numbering is stable.

Status legend: `[ ]` open · `[x]` resolved · `[~]` resolved, ADR written

## A — Matching rule (the "same event" test)

- [~] **A1.** Does the time window and geo radius for "same event" vary by
      hazard type (earthquake vs cyclone vs flood footprints are very
      different shapes), or is one window/radius pair used for everything at
      first?
      _Recommendation: start with per-hazard-type parameters — a single
      global radius will either be too tight for cyclone tracks or too loose
      for earthquakes — but only implement earthquake + cyclone to start
      (the two hazard types actually seen live in `feeds/`), falling back to
      a conservative default for everything else._
      **Resolved →** Per-hazard-type parameters, earthquake + cyclone tuned
      first, conservative default elsewhere. See ADR 0001.
- [~] **A2.** GDACS events contain episodes (finding: colours can disagree
      between event-level and episode-level). Does matching operate on the
      GDACS *event* or the *episode*?
      _Recommendation: match at the event level — episodes are revisions of
      the same event, not new candidate matches._
      **Resolved →** Match on GDACS Event; episodes are revisions within
      their Event, not separate candidates. See ADR 0001.
- [~] **A3.** USGS's `id` is unstable and rows should be matched on `ids`
      intersection (per `feeds/usgs.md` finding 3). Does that same
      instability/aliasing concern apply to how GDACS `eventid` is treated,
      or is GDACS's ID considered stable?
      **Resolved →** Apply the same defensive intersection/aliasing handling
      to GDACS `eventid`, despite no observed instability finding for it
      (chosen over treating it as stable). See ADR 0001.

## B — Aggregation (rolling many rows into one disaster)

- [~] **B1.** A mainshock + aftershocks becomes hundreds of USGS rows. What
      is the rule for rolling them into one fused disaster — same rupture
      sequence within a time/distance window of the mainshock? Is there a
      cutoff (e.g. magnitude floor) below which aftershocks are dropped
      instead of aggregated?
      _Recommendation: adopt a rule like "any earthquake within N hours and M
      km of an already-tracked mainshock is an aftershock of it, not a new
      candidate" — reuses the same time/geo mechanism as cross-feed
      matching (A1), rather than inventing a second rule._
      **Resolved →** Reuses the A1 per-hazard-type window; no magnitude
      floor, every aftershock rolls in. See ADR 0001.

## C — Confidence labeling

- [~] **C1.** How many corroboration confidence tiers are there? REQS.md
      names three examples ("USGS+GDACS corroborated", "USGS only,
      unconfirmed", "ReliefWeb-confirmed") — is that the full enum, or are
      there more (e.g. "GDACS only", "all three")?
      _Recommendation: enumerate the full closed set now since it's the
      "does this line deserve trust" signal the whole sitrep depends on —
      draft: `single-source (USGS)`, `single-source (GDACS)`,
      `shared-sensor (USGS+GDACS, common origin)`, `humanitarian-confirmed
      (ReliefWeb)`, `humanitarian+instrument (ReliefWeb + USGS and/or
      GDACS)`._
      **Resolved →** 5-tier draft as recommended, adopted verbatim. See ADR
      0002.
- [~] **C2.** Does the sitrep filter/sort by confidence tier, or only label
      each entry and leave ordering to severity?
      _Recommendation: sort by severity first (that's what a responder scans
      for), label confidence inline — filtering by confidence risks hiding a
      real single-source event._
      **Resolved →** Label only, sort by severity, as recommended. See ADR
      0002.

## D — Un-merging and revision

- [~] **D1.** When a later feed reveals two previously-matched fused
      disasters were actually different events (or vice versa — two separate
      fused records turn out to be one), does the fusion layer support
      un-merging/re-merging? If yes, how is that represented in the sitrep
      (an erratum line, a silent correction, both)?
      _Recommendation: support it, and always surface it explicitly — a
      responder who already acted on yesterday's sitrep needs to know a
      merge was wrong, so this should never be a silent correction._
      **Resolved →** Supported, always an explicit erratum. See ADR 0004.
- [~] **D2.** Where does GLIDE get attached once it arrives late — does it
      relabel/upgrade the confidence tier of the fused disaster's history, or
      only apply going forward?
      _Recommendation: relabel history — GLIDE confirms the match was
      correct retroactively, and the confidence label is meant to answer
      "should I trust this line," which is still true of past entries once
      confirmed._
      **Resolved →** Relabels history retroactively. See ADR 0004.

## E — Change taxonomy (state machine)

- [~] **E1.** The state machine is new → escalated → de-escalated → revised →
      closed → deleted. What specifically triggers each transition, e.g. is
      any GDACS `alertlevel` change an escalation/de-escalation, or only
      certain colour jumps? What counts as "revised" vs noise (GDACS
      `datemodified` churns on 87/100 events daily per `feeds/gdacs.md`
      finding 3, so *something* has to be filtered)?
      _Recommendation: diff on a fixed field allowlist per hazard type
      (alert colour, magnitude, affected-population estimate, todate/extent)
      exactly as `feeds/gdacs.md` finding 3 recommends, and treat any other
      field change as churn, not a transition._
      **Resolved →** Fixed field allowlist per hazard type, as recommended.
      See ADR 0003.
- [~] **E2.** What does "closed" mean for an ongoing/long-running GDACS event
      (wildfires open a month+, per finding 5) versus an instantaneous one
      like an earthquake? Is there a distinct "closed" trigger per hazard
      type?
      _Recommendation: yes — earthquake closes on a fixed quiet period after
      the last aftershock; ongoing hazards (wildfire, flood, drought) close
      when the source feed itself marks the event non-current
      (`iscurrent: false` in GDACS) or drops it from the feed._
      **Resolved →** Per-hazard-type closing trigger, as recommended. See
      ADR 0003.

## F — Which estimate to quote ("who is affected")

- [~] **F1.** REQS finding 4 says the impact line is attributed to whichever
      feed's estimate is quoted — is there a priority order when more than
      one estimate exists (e.g. GDACS colour available before USGS PAGER
      `alert`, which arrives late per `feeds/usgs.md` finding 5), or does the
      sitrep show all available estimates side by side, each labeled with
      its source?
      _Recommendation: show all available, each explicitly labeled by
      source — collapsing to a single number invites the sitrep to imply
      false precision on a figure that's always a model estimate at 08:30._
      **Resolved →** Show all available estimates, each labeled by source,
      never collapsed. See ADR 0005.

## G — Feed ingestion parameters

- [~] **G1.** Which USGS window and magnitude floor does the pipeline
      ingest — `all_day` (noisy, per finding 4), `4.5_day`, or
      `significant_week`? Does the floor differ for aggregation purposes
      (do we still want to see small aftershocks once a mainshock is
      tracked) versus for triggering a new fused disaster?
      _Recommendation: `4.5_day` as the ingestion floor for **new** fused
      disasters (matches GDACS's own global detection floor), but once a
      mainshock is tracked, also pull smaller magnitude events in its
      time/geo window from `all_day` so aftershock sequences aren't
      truncated._
      **Resolved →** `4.5_day` floor for new Incidents, `all_day` within an
      existing Incident's window for aftershocks. See ADR 0006.
- [~] **G2.** GDACS's `EVENTS4APP` endpoint returns exactly 100 features
      (likely an undocumented cap, per `feeds/gdacs.md` finding 4/open Q3).
      Is there a paged or filtered alternative, or does the pipeline accept
      the cap and just log when the response is suspiciously close to 100
      (signalling possible truncation)?
      _Recommendation: accept the cap for Day 1 (out of scope per REQS to
      build a general solution) but log a truncation-risk warning whenever a
      response returns exactly 100 features, so it's diagnosable later._
      **Resolved →** Accept the cap, log truncation-risk warning. See ADR
      0006.
- [~] **G3.** ReliefWeb: build against the RSS now and switch to the
      approved-appname API later (per finding 4), or block on appname
      approval first? If RSS is the Day 1 source, is the record-creation
      `pubDate` (pinned to 00:00, not the event time, per finding 3)
      acceptable as the ReliefWeb timestamp, given its only role is
      days-later confirmation?
      _Recommendation: build against RSS now (appname approval is an
      unparallelisable external dependency per finding 4, don't block on
      it); `pubDate` is acceptable since ReliefWeb's role is confirmation/
      enrichment, not detection — no report should ever depend on ReliefWeb
      timestamp precision._
      **Resolved →** RSS now, don't block on appname approval. See ADR 0006.

## H — Feed health and outage behaviour

- [~] **H1.** What does the sitrep say when a feed is unreachable (REQS
      finding 6's "quiet vs blind" problem)? Is a missed fetch reported
      immediately, or only if it's been down across N consecutive scheduled
      fetches?
      _Recommendation: report every day the health line is stale relative to
      the last successful fetch (e.g. "GDACS last reached 07:58 SGT
      yesterday") rather than waiting for N misses — a single missed fetch
      before an 08:30 sitrep is exactly the case finding 6 warns about._
      **Resolved →** Report on every stale fetch, not after N misses. See
      ADR 0007.
- [~] **H2.** GDACS and ReliefWeb publish no documented rate limits or SLA.
      What's a polite polling cadence for each, distinct from the ingestion
      window question in G1/G3?
      _Recommendation: match cadence to each feed's own latency tier from
      `feeds/README.md` finding 8 — USGS every few minutes, GDACS hourly,
      ReliefWeb RSS a few times a day — polling faster than a feed's own
      update tempo just adds load for no new information._
      **Resolved →** Cadence matches each feed's latency tier. See ADR 0007.

## I — Revision/deletion of already-published events

- [~] **I1.** USGS events are revised (magnitude corrections) or deleted
      outright after being published in a prior sitrep (finding 1). When
      that happens to an event already reported, does the next sitrep issue
      a silent correction or an explicit erratum line?
      _Recommendation: explicit erratum, for the same reason as D1 — a
      responder may have acted on the earlier number._
      **Resolved →** Explicit erratum, same policy as D1. See ADR 0004.

## J — Terminology (feeds into CONTEXT.md)

- [x] **J1.** We need one canonical term for the cross-feed fused unit,
      distinct from a single feed's own row (USGS "event", GDACS
      "event"/"episode", ReliefWeb "disaster"). REQS.md uses "fused
      disaster" / "disaster record" — is "Disaster" the term to canonicalise
      on (with each feed's raw row renamed "observation" or similar in our
      language), or is there a preferred term?
      _Recommendation: canonicalise the fused unit as **Disaster**, and call
      each feed's contributing row an **Observation** — keeps ReliefWeb's
      own "disaster" usage aligned with ours (it's already the fused/curated
      concept) while giving USGS/GDACS rows a name that doesn't collide._
      **Resolved →** Fused unit = **Incident**. Raw per-feed row keeps being
      called **Event**, matching USGS/GDACS's own field names directly (no
      translation layer between docs/code and `feeds/*.md`). Written to
      `CONTEXT.md`.

---

_Questions added mid-session go below this line, oldest first._

## K — Consistency checks (found cross-referencing the ADRs)

- [~] **K1.** ADR 0002's tier 5 (`humanitarian+instrument`) lumps together
      "ReliefWeb + a shared-sensor pair" (USGS+GDACS earthquake, same NEIC
      origin) with "ReliefWeb + one genuinely independent instrument feed"
      (e.g. GDACS-only cyclone estimate, since USGS doesn't cover cyclones).
      The whole point of ADR 0002 is not to conflate shared-sensor agreement
      with real corroboration — does that same distinction need to survive
      into tier 5, or is ReliefWeb's presence considered strong enough
      confirmation on its own that the instrument-side distinction stops
      mattering once it's there?
      **Resolved →** Collapse is fine — tier 5 stays a single tier. Amended
      into ADR 0002's Consequences.
- [~] **K2.** ADR 0003's change-taxonomy allowlist includes "affected-
      population estimate" as a field whose change can trigger a
      revised/escalated transition. ADR 0005 keeps every feed's impact
      estimate separate and displayed, never merged into one number. Does
      the allowlist mean each feed's own estimate field is diffed
      independently (any single feed's number changing can trigger a
      transition), or is there meant to be one canonical
      "affected-population" field being diffed — which would contradict ADR
      0005's never-collapse decision?
      **Resolved →** Diffed per source feed, no canonical merged field —
      consistent with ADR 0005. Amended into ADR 0003's decision text.

## L — Consistency checks (step A2, final pass over CONTEXT.md + ADRs)

- [~] **L1.** ADR 0001/0003 key matching windows, allowlists, and closing
      rules off "hazard type," but no doc defines the canonical set. GDACS's
      `eventtype` enum is the obvious base, but USGS's `type` includes
      non-earthquake noise (explosion, quarry blast, ice quake) and
      ReliefWeb covers hazards with no GDACS equivalent (outbreaks,
      hailstorms). What's the canonical hazard-type taxonomy?
      **Resolved →** GDACS `eventtype` enum + catch-all `Other` for
      ReliefWeb-only hazards; non-earthquake USGS `type`s filtered out
      before matching. See ADR 0008, `CONTEXT.md`.
- [~] **L2.** ADR 0004 commits to supporting un-merge/re-merge but doesn't
      say what triggers detecting a mis-merge.
      **Resolved →** Automatic re-evaluation of every Incident's
      constituent Events against the ADR 0001 matching rule on every run,
      not only on an explicit contradicting signal. Amended into ADR 0004.
- [~] **L3.** ADR 0003's closing rule is per-hazard-type but doesn't say
      which feed's signal is authoritative when an Incident's matched
      Events disagree on closure (e.g. GDACS marks a wildfire non-current
      while a matched ReliefWeb record is still "ongoing").
      **Resolved →** The hazard type's designated closing-authority feed
      decides regardless of other matched feeds' signals; disagreement is
      shown as informational context, not a reason to stay open. Amended
      into ADR 0003.

## M — Consistency checks (step E, shaping docs vs. grill-with-docs outputs)

- [x] **M1.** `docs/PRD.md`'s Testing Decisions section (written before a
      shape was chosen) says the seam is "raw feed fixtures in, rendered
      sitrep content (or the Incident list behind it) out" and that tests
      should "assert on observable content." Now that Shape A is selected,
      that content includes A5's LLM-authored narrative prose — wording
      that can legitimately vary between runs on identical input, even
      though the underlying facts don't. Asserting on exact rendered HTML
      text would make tests flaky for a reason that has nothing to do with
      a real bug.
      **Resolved →** `docs/PRD.md` amended: the *primary* test target is
      now explicitly the Incident list (A3's output, fully deterministic —
      hazard type, confidence tier, state, per-source impact estimates,
      erratum flags), not the rendered HTML. Prose from A5 is checked only
      for structural properties (e.g. "contains no number absent from the
      source estimates"), never exact text match. This was already
      half-anticipated by the seam's original "(or the Incident list
      behind it)" phrasing — Shape A just makes the choice concrete rather
      than optional.
- [~] **M2.** ADR 0007 says "polling cadence matches each feed's own
      latency tier ... USGS every few minutes, GDACS hourly, ReliefWeb a
      few times a day" and resolves H1 by saying the health line updates
      "rather than waiting for N consecutive misses" — both phrasings
      assume multiple scheduled fetches per feed per day. Shape A's A1 is
      a **single** daily trigger (00:30 UTC / 08:30 SGT). As detailed in
      `SHAPING.md`/`SLICES.md`, a once-daily fetch technically satisfies
      ADR 0007's cadence as an upper *ceiling* ("no faster than"), but it
      cannot actually catch a feed outage sooner than 24h, which is what
      ADR 0007's original multi-fetch framing was for. This was resolved
      unilaterally while writing `SLICES.md`, without confirming with the
      user first — flagging it properly now rather than letting it stand
      on that basis alone.
      **Resolved →** User chose fidelity over simplicity: added **A7**, a
      separate intraday health-check job per feed (own cadence, writes
      only to its own health file, no fusion). The once-daily A1 run reads
      all three health files at render time. ADR 0007's original per-feed
      cadence is now literally implemented, not just a satisfied ceiling.
      Amended into ADR 0007, `SHAPING.md` (new A4.3 + A7 components,
      updated breadboard/wiring), and `SLICES.md` (A7 rolls out per feed
      alongside that feed's ingestion adapter, V1→V3).
