// A6.1/A6.2: renders dashboard.html. Regenerates and is committed every
// run, unconditionally (SHAPING.md's A6.2 fix, derived from ADR 0007) --
// the freshness line and health block are the one thing guaranteed to
// update whether or not any Incident changed. Impact estimates are read
// directly from the Incident record, never from the narrative text
// (SHAPING.md's A5.2 fix).
//
// Color use follows the dataviz skill's method: status colors (good/
// warning/critical) encode Incident *state* and nothing else; the fixed
// categorical order encodes *feed identity* (USGS = slot 1 blue, GDACS =
// slot 2 aqua, ReliefWeb = slot 3 yellow); confidence tier gets a
// neutral outline treatment so it's never mistaken for either. Every
// color pairs with a text label (the "relief rule" for the low-contrast
// slots) -- nothing here means anything by color alone.
import { FeedHealth, Incident, IncidentState } from "../types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Alert levels (GDACS's Green/Orange/Red, USGS PAGER's green/yellow/
 *  orange/red) are a status dimension in their own right, distinct from
 *  Incident *state* -- they get their own reserved colors rather than
 *  reusing the state-badge palette, so an amber "escalated" state badge
 *  is never confused with an amber "orange" alert level in the same card. */
const ALERT_LEVEL_CLASS: Record<string, string> = {
  green: "alert-green",
  yellow: "alert-yellow",
  orange: "alert-orange",
  red: "alert-red",
};

function alertLevelSpan(value: string): string {
  const cls = ALERT_LEVEL_CLASS[value.toLowerCase()];
  const escaped = escapeHtml(value);
  return cls ? `<strong class="${cls}">${escaped}</strong>` : `<strong>${escaped}</strong>`;
}

/** V3: not every hazard type carries a magnitude (only Earthquake does).
 *  ADR 0002's "sorted by severity only" promise needs a comparable value
 *  across hazard types, so GDACS's own alert level substitutes as a
 *  proxy when magnitude is absent -- a judgment call (implementation-
 *  notes.md), not a spec: the two scales aren't truly commensurable, but
 *  this keeps a Red-alert wildfire from silently sorting as "0 severity"
 *  behind every earthquake. */
const GDACS_ALERT_SEVERITY: Record<string, number> = { Green: 2, Orange: 5, Red: 8 };

function magnitudeOf(incident: Incident): number | null {
  const magnitudes = incident.memberEvents
    .map((e) => e.estimate.magnitude)
    .filter((m): m is number => m !== undefined);
  return magnitudes.length > 0 ? Math.max(...magnitudes) : null;
}

function severity(incident: Incident): number {
  const magnitude = magnitudeOf(incident);
  if (magnitude !== null) return magnitude;
  const alertLevels = incident.memberEvents
    .map((e) => e.estimate.gdacsAlertLevel)
    .filter((a): a is "Green" | "Orange" | "Red" => !!a);
  if (alertLevels.length > 0) {
    return Math.max(...alertLevels.map((a) => GDACS_ALERT_SEVERITY[a] ?? 0));
  }
  return 0;
}

function formatSgt(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatCoords(coords: [number, number, number?]): string {
  const [lon, lat] = coords;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

const STATE_LABEL: Record<IncidentState, string> = {
  new: "new",
  escalated: "escalated",
  "de-escalated": "de-escalated",
  revised: "revised",
  closed: "closed",
  deleted: "deleted",
};

function renderHealthLine(h: FeedHealth): string {
  const status = h.lastError
    ? `<span class="health-pill health-bad"><span class="dot"></span>unreachable</span> <span class="health-detail">${escapeHtml(h.lastError)}</span>`
    : `<span class="health-pill health-ok"><span class="dot"></span>reachable</span> <span class="health-detail">last checked ${h.lastSuccessAtUtc ? formatSgt(h.lastSuccessAtUtc) : "never"} SGT</span>`;
  return `<li class="feed-${h.feed}"><span class="feed-name">${h.feed.toUpperCase()}</span> ${status}</li>`;
}

function renderErratumLog(incident: Incident): string {
  if (!incident.erratumLog.length) return "";
  const items = incident.erratumLog
    .map((e) => `<li>${escapeHtml(e.description)} <span class="ts">${formatSgt(e.atUtc)} SGT</span></li>`)
    .join("");
  return `<div class="erratum"><strong>Erratum</strong><ul>${items}</ul></div>`;
}

function renderImpactEstimates(incident: Incident): string {
  if (!incident.impactEstimates.length) {
    return `<div class="impact impact-none">No impact estimate available yet.</div>`;
  }
  const items = incident.impactEstimates
    .map(
      (e) =>
        `<li class="feed-${e.source}"><span class="feed-chip">${e.source.toUpperCase()}</span> ${escapeHtml(e.label)}: ${alertLevelSpan(e.value)}</li>`
    )
    .join("");
  return `<ul class="impact">${items}</ul>`;
}

function renderMemberRow(event: Incident["memberEvents"][number]): string {
  const detail =
    event.feed === "gdacs"
      ? event.estimate.gdacsAlertLevel
        ? `Alert: ${alertLevelSpan(event.estimate.gdacsAlertLevel)}`
        : "—"
      : event.estimate.pagerAlert
        ? `PAGER: ${alertLevelSpan(event.estimate.pagerAlert)}`
        : "—";
  return `
    <tr>
      <td><span class="feed-chip feed-${event.feed}">${event.feed.toUpperCase()}</span></td>
      <td class="tabular">${formatSgt(event.occurredAtUtc)}</td>
      <td class="tabular">${event.estimate.magnitude !== undefined ? `M ${event.estimate.magnitude.toFixed(1)}` : "—"}</td>
      <td class="tabular">${formatCoords(event.location.coordinates)}</td>
      <td>${detail}</td>
    </tr>`;
}

function renderEventsDetail(incident: Incident): string {
  const rows = [...incident.memberEvents]
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc))
    .map(renderMemberRow)
    .join("");
  const count = incident.memberEvents.length;
  return `
    <details class="events-detail">
      <summary>${count} contributing event${count === 1 ? "" : "s"}</summary>
      <div class="table-wrap">
        <table class="events-table">
          <thead>
            <tr><th>Source</th><th>Time (SGT)</th><th>Magnitude</th><th>Location</th><th>Estimate</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="events-footer">Incident id: <code>${escapeHtml(incident.id)}</code></p>
    </details>`;
}

/**
 * Closed Incidents always get a fixed string -- no model call needed for
 * that case (the sitrep skill only ever narrates non-closed Incidents).
 * A pending (`null`) narrative on a non-closed Incident means the
 * deterministic pass (scripts/sitrep.ts) ran but the sitrep skill hasn't
 * yet -- this placeholder is overwritten once it does, later in the same
 * workflow run (SHAPING.md's A5/A6 split).
 */
function narrativeFor(incident: Incident): string {
  if (incident.state === "closed") return "Sequence closed -- no new activity.";
  return incident.narrative ?? "(awaiting narration)";
}

/** Only Earthquake carries a real magnitude -- every other hazard type
 *  shows its hazard type instead of a fabricated "M 0.0" (a real display
 *  bug caught by rendering V3's live multi-hazard output and looking at
 *  it, not just by the numbers compiling). */
function renderSeverityBadge(incident: Incident): string {
  const magnitude = magnitudeOf(incident);
  if (magnitude !== null) return `<span class="mag">M&nbsp;${magnitude.toFixed(1)}</span>`;
  return `<span class="hazard-type">${escapeHtml(incident.hazardType)}</span>`;
}

function renderIncident(incident: Incident): string {
  const anchor = incident.memberEvents[incident.memberEvents.length - 1];
  const closed = incident.state === "closed" ? " is-closed" : "";
  return `
    <article class="incident${closed}">
      <header>
        <span class="badge state-badge state-${incident.state}"><span class="dot"></span>${STATE_LABEL[incident.state]}</span>
        <span class="badge tier-badge">${escapeHtml(incident.confidenceTier)}</span>
        ${renderSeverityBadge(incident)}
        <span class="place">${escapeHtml(anchor.place)}</span>
      </header>
      <p class="narrative">${escapeHtml(narrativeFor(incident))}</p>
      ${renderImpactEstimates(incident)}
      ${renderErratumLog(incident)}
      ${renderEventsDetail(incident)}
    </article>`;
}

export function renderDashboard(params: {
  incidents: Incident[];
  health: FeedHealth[];
  generatedAtUtc: string;
}): string {
  const { incidents, health, generatedAtUtc } = params;
  const active = [...incidents].sort((a, b) => severity(b) - severity(a));
  const hasContent = active.length > 0;

  const body = hasContent
    ? active.map((inc) => renderIncident(inc)).join("\n")
    : `<p class="quiet">No active Incidents. Checked and nothing new.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HADR Monitor</title>
<style>
  :root {
    --surface-page:   #f9f9f7;
    --surface-card:   #fcfcfb;
    --ink-primary:    #0b0b0b;
    --ink-secondary:  #52514e;
    --ink-muted:      #898781;
    --border:         #e1e0d9;
    --border-strong:  #c3c2b7;

    --feed-usgs:      #2a78d6;
    --feed-usgs-tint: #e7f0fc;
    --feed-gdacs:     #1baf7a;
    --feed-gdacs-tint:#e3f7ee;
    /* Categorical slot 3 (yellow). Raw #eda100 is the palette's own hue
       but text-contrast-unsafe as small chip text (same "relief rule" as
       the status colors below) -- substituted with the same text-safe
       amber step already used for --status-escalated. */
    --feed-reliefweb:      #9c6a00;
    --feed-reliefweb-tint: #fdf0d9;

    /* Status hues per dataviz skill's fixed status palette. The raw
       "warning" (#fab219) and "good" (#0ca30c) hexes are text-contrast-
       unsafe on a light surface (documented 1.79 and 3.27 respectively)
       -- using them as small badge text would be close to illegible.
       Substituted with the palette's own text-safe variants: "good" ->
       the documented success-text green (#006300); "warning" -> the
       darker step from the same amber family used for categorical
       slot 3's dark step (#c98500). Same semantic hue family, a shade
       chosen for legibility as foreground text specifically. */
    --status-new:          #2a78d6;
    --status-new-tint:     #e7f0fc;
    --status-escalated:      #9c6a00;
    --status-escalated-tint: #fff2d6;
    --status-deescalated:      #006300;
    --status-deescalated-tint: #e5f6e5;
    --status-revised:      #4a3aa7;
    --status-revised-tint: #ece9fa;
    --status-closed:       #898781;
    --status-closed-tint:  #eeede9;

    --erratum-accent: #c98500;
    --erratum-tint:   #fff2d6;
    --health-good:    #006300;
    --health-bad:     #d03b3b;

    /* Alert-level colors (GDACS Green/Orange/Red, USGS PAGER green/
       yellow/orange/red) -- a traffic-light ramp distinct from the state
       badges above. Green/yellow reuse the same text-safe steps as
       --status-deescalated/--status-escalated (same underlying "good"/
       "warning" hues); orange is the palette's "serious" step, darkened
       for light-surface legibility (raw #ec835a is only 2.57:1); red
       reuses --health-bad ("critical", already validated at 4.68:1). */
    --alert-green:  #006300;
    --alert-yellow: #9c6a00;
    --alert-orange: #a8461f;
    --alert-red:    #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --surface-page:   #0d0d0d;
      --surface-card:   #1a1a19;
      --ink-primary:    #ffffff;
      --ink-secondary:  #c3c2b7;
      --ink-muted:      #898781;
      --border:         #2c2c2a;
      --border-strong:  #383835;

      --feed-usgs:      #3987e5;
      --feed-usgs-tint: #152841;
      --feed-gdacs:     #199e70;
      --feed-gdacs-tint:#0f2b21;
      /* Categorical slot 3's own dark step -- validated as a set at
         >=3:1 on the dark surface (references/palette.md), used directly. */
      --feed-reliefweb:      #c98500;
      --feed-reliefweb-tint: #332708;

      /* Dark surface is far more forgiving to the raw status hexes
         (documented 9.49 / 5.19 contrast) -- used directly here, unlike
         the light-mode text-safe substitutes above. */
      --status-new:          #3987e5;
      --status-new-tint:     #152841;
      --status-escalated:      #fab219;
      --status-escalated-tint: #3a2c0c;
      --status-deescalated:      #0ca30c;
      --status-deescalated-tint: #123a12;
      --status-revised:      #9085e9;
      --status-revised-tint: #241f42;
      --status-closed:       #a3a196;
      --status-closed-tint:  #232320;

      --erratum-accent: #e0a333;
      --erratum-tint:   #3a2c0c;
      --health-good:    #0ca30c;
      --health-bad:     #e66767;

      /* Dark surface tolerates the raw palette steps directly (same
         reasoning as the status colors above). */
      --alert-green:  #0ca30c;
      --alert-yellow: #fab219;
      --alert-orange: #ec835a;
      --alert-red:    #e66767;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 32px 20px 64px;
    color: var(--ink-primary);
    background: var(--surface-page);
  }
  header.page {
    margin-bottom: 28px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 23px;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  .freshness { color: var(--ink-secondary); font-size: 14px; }
  ul.health {
    list-style: none;
    padding: 0;
    margin: 14px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    font-size: 13.5px;
  }
  ul.health li { display: flex; align-items: center; gap: 6px; }
  .feed-name { font-weight: 700; letter-spacing: 0.02em; color: var(--ink-secondary); }
  .health-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
  }
  .health-pill .dot { width: 7px; height: 7px; border-radius: 50%; }
  .health-ok { color: var(--health-good); }
  .health-ok .dot { background: var(--health-good); }
  .health-bad { color: var(--health-bad); }
  .health-bad .dot { background: var(--health-bad); }
  .health-detail { color: var(--ink-muted); }

  .incident {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 14px;
    background: var(--surface-card);
  }
  .incident.is-closed { opacity: 0.65; }

  header + .narrative { margin-top: 12px; }
  .incident header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .badge .dot { width: 6px; height: 6px; border-radius: 50%; }

  .state-badge.state-new           { background: var(--status-new-tint);        color: var(--status-new); }
  .state-badge.state-new .dot            { background: var(--status-new); }
  .state-badge.state-escalated     { background: var(--status-escalated-tint);      color: var(--status-escalated); }
  .state-badge.state-escalated .dot      { background: var(--status-escalated); }
  .state-badge.state-de-escalated  { background: var(--status-deescalated-tint);      color: var(--status-deescalated); }
  .state-badge.state-de-escalated .dot   { background: var(--status-deescalated); }
  .state-badge.state-revised       { background: var(--status-revised-tint);     color: var(--status-revised); }
  .state-badge.state-revised .dot        { background: var(--status-revised); }
  .state-badge.state-closed,
  .state-badge.state-deleted       { background: var(--status-closed-tint);      color: var(--status-closed); }
  .state-badge.state-closed .dot,
  .state-badge.state-deleted .dot        { background: var(--status-closed); }

  .tier-badge {
    background: transparent;
    color: var(--ink-secondary);
    border: 1px solid var(--border-strong);
    font-weight: 500;
  }

  .mag { font-weight: 700; font-variant-numeric: tabular-nums; margin-left: 2px; }
  .hazard-type { font-weight: 700; margin-left: 2px; }
  .place { color: var(--ink-secondary); }

  .narrative { margin: 0 0 10px; line-height: 1.5; }

  ul.impact { list-style: none; font-size: 13.5px; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  ul.impact li { display: flex; align-items: center; gap: 8px; }
  .impact-none { color: var(--ink-muted); font-size: 13px; font-style: italic; margin: 0 0 10px; }
  .feed-chip {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 2px 7px;
    border-radius: 5px;
  }
  .feed-chip.feed-usgs, .feed-usgs .feed-chip { background: var(--feed-usgs-tint); color: var(--feed-usgs); }
  .feed-chip.feed-gdacs, .feed-gdacs .feed-chip { background: var(--feed-gdacs-tint); color: var(--feed-gdacs); }
  .feed-chip.feed-reliefweb, .feed-reliefweb .feed-chip { background: var(--feed-reliefweb-tint); color: var(--feed-reliefweb); }

  .alert-green  { color: var(--alert-green); }
  .alert-yellow { color: var(--alert-yellow); }
  .alert-orange { color: var(--alert-orange); }
  .alert-red    { color: var(--alert-red); }

  .erratum {
    background: var(--erratum-tint);
    border-left: 3px solid var(--erratum-accent);
    padding: 10px 14px;
    margin: 0 0 10px;
    font-size: 13px;
    border-radius: 0 6px 6px 0;
  }
  .erratum ul { margin: 6px 0 0; padding-left: 18px; }
  .erratum .ts { color: var(--ink-muted); }

  details.events-detail {
    margin-top: 4px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  details.events-detail summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-secondary);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }
  details.events-detail summary::-webkit-details-marker { display: none; }
  details.events-detail summary::before {
    content: "";
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 4px 0 4px 6px;
    border-color: transparent transparent transparent var(--ink-muted);
    transition: transform 0.15s ease;
    flex: none;
  }
  details.events-detail[open] summary::before { transform: rotate(90deg); }
  details.events-detail summary:hover { color: var(--ink-primary); }

  .table-wrap { overflow-x: auto; margin-top: 10px; }
  table.events-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.events-table th {
    text-align: left;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted);
    padding: 0 10px 6px 0;
    font-weight: 600;
  }
  table.events-table td {
    padding: 6px 10px 6px 0;
    border-top: 1px solid var(--border);
    vertical-align: middle;
  }
  table.events-table td.tabular { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .events-footer { margin: 10px 0 0; font-size: 12px; color: var(--ink-muted); }
  .events-footer code { font-size: 11.5px; }

  .quiet { color: var(--ink-secondary); }
</style>
</head>
<body>
  <header class="page">
    <h1>HADR Monitor</h1>
    <div class="freshness">Checked ${formatSgt(generatedAtUtc)} SGT</div>
    <ul class="health">${health.map(renderHealthLine).join("")}</ul>
  </header>
  <main>
${body}
  </main>
</body>
</html>
`;
}
