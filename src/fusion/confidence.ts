// ADR 0002. V1 is USGS-only, so the other four tiers aren't reachable yet
// (SLICES.md V1: "the tier enum exists in the UI but is degenerate").
import { ConfidenceTier, Incident } from "../types";

export function assignConfidenceTier(_incident: Incident): ConfidenceTier {
  return "single-source (USGS)";
}
