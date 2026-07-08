# CLAUDE.md

## Language & tooling

Node.js + TypeScript, compiled with `tsc` to CommonJS (no bundler, no
framework, no runtime dependencies at all beyond Node's built-ins).
Deterministic logic lives under `src/` and `scripts/` (per
`scripts/README.md`'s own rule: "anything that must give the same answer
twice does not belong in a prompt"). The one place an LLM touches this
pipeline is the `sitrep` Claude Code skill (`skills/sitrep/SKILL.md`),
invoked headlessly via `anthropics/claude-code-action` from
`.github/workflows/sitrep.yml` — and only when the deterministic pass
(`scripts/sitrep.ts`) signals there's an Incident actually waiting on a
narrative. There is no direct Anthropic SDK call anywhere in this
codebase; narration happens by running Claude Code itself, not by calling
an API from our own code. Target Node 20 in CI (`actions/setup-node`);
the code itself only uses Node 18+ APIs (global `fetch`), no
CI-specific syntax.

## Test command

`npm test` (compiles via `tsc`, then runs `dist/test/run-all.js`). No test
framework — plain Node `assert`, one file per concern
(`test/fusion.test.ts`, `test/ingest.test.ts`), each exporting a `run()`
that throws on failure. This was a deliberate choice over
vitest/jest: the sandbox this was built in is capped at Node 16 by an old
host glibc, and pinning to a framework version compatible with that cap
would have meant testing against something CI doesn't actually run.
Assertions target the Incident list (`docs/PRD.md`'s Testing Decisions) —
never the LLM-generated narrative text, which isn't expected to be
byte-identical across runs.

## Conventions

- One Detail-A part (see `SHAPING.md`) per module where practical; module
  and function comments cross-reference the part number (`A3.1`, `A5.2`,
  etc.) so a reviewer can trace code back to the shaping doc that decided it.
- Confidence tier, hazard type, and Incident state are closed string-union
  types in `src/types.ts`, not open strings — matching `CONTEXT.md`'s enums
  exactly.
- The fusion engine (`src/fusion/*`) is pure: `fuse(events, priorIncidents,
  nowUtc)` takes explicit inputs, returns a new array, never touches the
  filesystem or the network. Everything I/O-shaped (ingestion, storage,
  narration, rendering) is a thin wrapper around it.

## Deviations policy

Anything built that departs from `SLICES.md` / the ADRs is recorded in
`implementation-notes.md`, with the reason. An undocumented deviation is a
bug.
