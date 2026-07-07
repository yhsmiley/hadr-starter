# HADR Monitor

A monitoring agent for humanitarian assistance and disaster response (HADR).

## What is HADR?

Humanitarian Assistance and Disaster Response is the umbrella term for the work
that follows a natural or man-made disaster — earthquakes, cyclones, floods,
volcanic eruptions, droughts, conflict displacement. It spans the first hours of
search and rescue through relief delivery and early recovery, and it is carried
out by a mix of national agencies, militaries, UN bodies (such as OCHA) and NGOs.

The part this project cares about is **situational awareness**: responders and
planners need to know, as early and as accurately as possible, what happened,
where, how severe it is, and who is affected. That picture is assembled from
feeds like the ones in `feeds/` — instrument networks (USGS), multi-hazard alert
systems (GDACS) and curated humanitarian reporting (ReliefWeb) — and is
traditionally summarised in a *situation report* ("sitrep"). This repository is
about building an agent that does that watching and summarising unattended.

## The end state

By Wednesday afternoon this repository contains an agent that:

- watches live disaster feeds — GDACS, USGS and ReliefWeb (see `feeds/`)
- filters out the noise and assesses what remains: what happened, where, how bad, who is affected
- publishes a morning situation report to `dashboard.html` at 08:30 Singapore time
- runs on a schedule, unattended, and stays quiet when nothing has changed

How it does any of that is not specified anywhere in this repository. That is the course.

## The three days

1. **Plan** — interrogate the feeds, write the PRD, cut it into vertical slices
2. **Autonomy** — build the first slice, write a skill, wire up the 08:30 routine, launch the overnight loop
3. **Trust** — review code you didn't write, harden the pipeline, demo

## Artefacts expected by the end

`prd.html` · `system-view.html` · `implementation-notes.md` · `dashboard.html` · `goal.md` · at least one skill

## Day 1 setup

1. Sign in to Claude Code with your Team seat
2. Create your own repository from this template, then clone it
3. Run `/install-github-app` so @claude reviews your pull requests from Day 2
4. Install OpenCode and sign in with your Go key

Fill in `CLAUDE.md` before your first prompt.
