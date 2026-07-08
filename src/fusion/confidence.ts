// ADR 0002. V3 (SLICES.md) reaches the full five-tier enum now that
// ReliefWeb exists: `humanitarian-confirmed` (ReliefWeb only, no
// instrument member) and `humanitarian+instrument` (ReliefWeb plus USGS
// and/or GDACS) both fire for real. Per ADR 0002's own consequence note,
// tier 5 deliberately does not distinguish whether the instrument side is
// shared-sensor or a single feed -- ReliefWeb confirmation is already the
// strongest signal, so that nuance wouldn't change a reader's decision.
import { ConfidenceTier, Incident } from "../types";

export function assignConfidenceTier(incident: Incident): ConfidenceTier {
  const feeds = new Set(incident.memberEvents.map((e) => e.feed));
  const hasUsgs = feeds.has("usgs");
  const hasGdacs = feeds.has("gdacs");
  const hasReliefWeb = feeds.has("reliefweb");

  if (hasReliefWeb && (hasUsgs || hasGdacs)) return "humanitarian+instrument";
  if (hasReliefWeb) return "humanitarian-confirmed";
  if (hasUsgs && hasGdacs) return "shared-sensor (USGS+GDACS)";
  if (hasGdacs) return "single-source (GDACS)";
  return "single-source (USGS)";
}
