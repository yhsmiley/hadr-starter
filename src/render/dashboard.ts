// A6.1/A6.2: renders dashboard.html. Regenerates and is committed every
// run, unconditionally (SHAPING.md's A6.2 fix, derived from ADR 0007) --
// the freshness line and health block are the one thing guaranteed to
// update whether or not any Incident changed. Impact estimates are read
// directly from the Incident record, never from the narrative text
// (SHAPING.md's A5.2 fix).
import { FeedHealth, Incident } from "../types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function severity(incident: Incident): number {
  return Math.max(0, ...incident.memberEvents.map((e) => e.estimate.magnitude ?? 0));
}

function formatSgt(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderHealthLine(h: FeedHealth): string {
  const status = h.lastError
    ? `<span class="health-bad">unreachable (${escapeHtml(h.lastError)})</span>`
    : `<span class="health-ok">last reached ${h.lastSuccessAtUtc ? formatSgt(h.lastSuccessAtUtc) : "never"} SGT</span>`;
  return `<li><strong>${h.feed.toUpperCase()}</strong>: ${status}</li>`;
}

function renderErratumLog(incident: Incident): string {
  if (!incident.erratumLog.length) return "";
  const items = incident.erratumLog
    .map((e) => `<li>${escapeHtml(e.description)} <span class="ts">(${formatSgt(e.atUtc)} SGT)</span></li>`)
    .join("");
  return `<div class="erratum"><strong>Erratum</strong><ul>${items}</ul></div>`;
}

function renderImpactEstimates(incident: Incident): string {
  if (!incident.impactEstimates.length) {
    return `<div class="impact impact-none">No impact estimate available yet.</div>`;
  }
  const items = incident.impactEstimates
    .map((e) => `<li><strong>${e.source.toUpperCase()} ${escapeHtml(e.label)}:</strong> ${escapeHtml(e.value)}</li>`)
    .join("");
  return `<ul class="impact">${items}</ul>`;
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

function renderIncident(incident: Incident): string {
  const mag = severity(incident);
  const anchor = incident.memberEvents[incident.memberEvents.length - 1];
  const closed = incident.state === "closed" ? " closed" : "";
  return `
    <article class="incident${closed}">
      <header>
        <span class="badge badge-state badge-${incident.state}">${incident.state}</span>
        <span class="badge badge-tier">${escapeHtml(incident.confidenceTier)}</span>
        <span class="mag">M ${mag.toFixed(1)}</span>
        <span class="place">${escapeHtml(anchor.place)}</span>
      </header>
      <p class="narrative">${escapeHtml(narrativeFor(incident))}</p>
      ${renderImpactEstimates(incident)}
      ${renderErratumLog(incident)}
      <footer class="meta">${incident.memberEvents.length} event(s) on record &middot; id ${incident.id}</footer>
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
<title>HADR Monitor</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a; background: #fafafa; }
  header.page { margin-bottom: 24px; border-bottom: 1px solid #ddd; padding-bottom: 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .freshness { color: #555; font-size: 14px; }
  ul.health { list-style: none; padding: 0; margin: 8px 0 0; font-size: 14px; }
  .health-ok { color: #1a7f37; }
  .health-bad { color: #c0341d; font-weight: 600; }
  .incident { border: 1px solid #ddd; border-radius: 6px; padding: 14px 16px; margin-bottom: 14px; background: #fff; }
  .incident.closed { opacity: 0.6; }
  .badge { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; margin-right: 6px; background: #eee; }
  .badge-state.new { background: #d6e4ff; }
  .badge-state.escalated { background: #ffe0b2; }
  .badge-state.revised { background: #fff3b0; }
  .badge-state.closed { background: #e0e0e0; }
  .mag { font-weight: 700; margin-right: 8px; }
  .place { color: #444; }
  .narrative { margin: 10px 0; }
  ul.impact { font-size: 14px; margin: 8px 0; padding-left: 18px; }
  .impact-none { color: #888; font-size: 13px; font-style: italic; }
  .erratum { background: #fff8e1; border-left: 3px solid #e8a33d; padding: 8px 12px; margin-top: 10px; font-size: 13px; }
  .meta { color: #999; font-size: 12px; margin-top: 8px; }
  .quiet { color: #555; }
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
