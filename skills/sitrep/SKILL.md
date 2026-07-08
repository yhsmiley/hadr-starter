---
name: sitrep
description: Narrate HADR Incidents awaiting narration, then regenerate dashboard.html. Invoked headlessly by .github/workflows/sitrep.yml, only when scripts/sitrep.ts (the deterministic ingest+fusion pass that ran immediately before this) found something that needs it.
model: claude-opus-4-8
---

# Sitrep narration

`scripts/sitrep.ts` already ran, deterministically, before you were
invoked. It ingested USGS, fused Events into Incidents (see `SHAPING.md`
Detail A and `src/fusion/`), wrote the result to `state/incidents.json`,
and rendered a first pass of `dashboard.html`. Every fact about every
Incident is already decided — hazard type, state, confidence tier, member
events, impact estimates. None of that is your job, and none of it should
change here. You are the only step in this pipeline that touches an LLM,
and your job is narrow: turn already-settled facts into a sentence.

## Your job

For every Incident in `state/incidents.json` where `state` is not
`"closed"` and `narrative` is `null`:

1. Write one factual sentence, max 30 words, describing it — hazard type,
   place, magnitude, and (if `memberEvents.length > 1`) that aftershocks
   are included.
2. Set that Incident's `narrative` field to the sentence.

Then run `npm run render` to regenerate `dashboard.html` from the updated
data — don't hand-write HTML yourself. The renderer
(`src/render/dashboard.ts`) is deterministic and already implements the
sitrep's layout (severity sort, health block, erratum markers, impact
estimates); your only output is the text of `narrative` fields.

## Rules for the sentence

- Never invent a figure that isn't already on the Incident record.
- Never mention how many people are affected, or any impact/exposure
  estimate — `impactEstimates` is rendered separately, directly from data
  (SHAPING.md's A5.2: this is a hard boundary, not a style preference —
  the whole reason narration is isolated to this one step is so it can
  never blend or restate a number ADR 0005 requires to stay separate and
  per-source).
- If `erratumLog` is non-empty, you may note that a correction exists, but
  don't restate its `description` verbatim — the renderer already shows it.
- Plain, factual tone. This is read by a duty officer at 08:30, not a
  headline writer.

## What not to touch

- Any Incident's `state`, `confidenceTier`, `memberEvents`,
  `impactEstimates`, or `erratumLog` — those are fusion-engine outputs.
- `state/health-usgs.json` or `state/raw/` — owned by other jobs.
- Any `.ts` source file. If the renderer or fusion engine seems wrong,
  that's a bug report, not something to patch from inside this skill.
