// ADR 0002. V2 (SLICES.md): USGS+GDACS earthquakes reach `single-source`
// (either feed) and `shared-sensor` -- never treated as independent
// corroboration, since GDACS's earthquake data sources from NEIC, the
// same origin as USGS (feeds/gdacs.md finding 1). The humanitarian tiers
// stay unreachable until ReliefWeb exists (V3).
import { ConfidenceTier, Incident } from "../types";

export function assignConfidenceTier(incident: Incident): ConfidenceTier {
  const feeds = new Set(incident.memberEvents.map((e) => e.feed));
  const hasUsgs = feeds.has("usgs");
  const hasGdacs = feeds.has("gdacs");

  if (hasUsgs && hasGdacs) return "shared-sensor (USGS+GDACS)";
  if (hasGdacs) return "single-source (GDACS)";
  return "single-source (USGS)";
}
