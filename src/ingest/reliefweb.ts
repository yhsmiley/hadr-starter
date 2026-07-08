// A2.3 (SLICES.md V3): ReliefWeb adapter.
//  - Parses the RSS feed (ADR 0006 -- no structured-API appname required);
//    no external XML library, per this codebase's zero-runtime-dependency
//    rule -- regex extraction over a known, stable feed shape, same
//    precedent as GDACS's own htmldescription magnitude parsing.
//  - GLIDE extracted from the `tag glide` div (feeds/reliefweb.md finding
//    5: reliably present here, unlike GDACS). Hazard type is derived from
//    GLIDE's own 2-letter prefix first (ADR 0008's canonical taxonomy
//    reuses GDACS's eventtype letters), falling back to a title keyword
//    match, and finally the `Other` catch-all.
//  - The RSS carries no geometry at all -- `location` is a country
//    centroid (src/ingest/countryCentroids.ts), display-only, never used
//    for matching (src/fusion/fuse.ts attaches ReliefWeb events by GLIDE
//    or place-name, not geo radius).
//  - `pubDate` is the record-creation date, not event time (ADR 0006) --
//    acceptable since ReliefWeb only ever confirms/enriches, never detects.
import { FeedEvent, HazardType } from "../types";
import { centroidFor } from "./countryCentroids";

const RSS_URL = "https://reliefweb.int/disasters/rss.xml";

/** ADR 0008's taxonomy, keyed on GLIDE's own hazard-type prefix (shared
 *  with GDACS's eventtype enum for the six types both feeds recognize). */
const GLIDE_PREFIX_MAP: Record<string, HazardType> = {
  EQ: "Earthquake",
  TC: "Cyclone",
  FL: "Flood",
  VO: "Volcano",
  DR: "Drought",
  WF: "Wildfire",
};

const TITLE_KEYWORD_MAP: Array<[RegExp, HazardType]> = [
  [/earthquake/i, "Earthquake"],
  [/(cyclone|hurricane|typhoon|tropical storm)/i, "Cyclone"],
  [/flood/i, "Flood"],
  [/volcan/i, "Volcano"],
  [/drought/i, "Drought"],
  [/(wildfire|forest fire|bush fire)/i, "Wildfire"],
];

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

function unwrapCdata(s: string): string {
  const m = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(s.trim());
  return (m ? m[1] : s).trim();
}

function extractTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? unwrapCdata(m[1]) : null;
}

function extractTaggedDiv(html: string, className: string): string | null {
  const m = new RegExp(`<div class="tag ${className}"[^>]*>([^<]*)</div>`, "i").exec(html);
  return m ? m[1].trim() : null;
}

function deriveHazardType(glide: string | null, title: string): HazardType {
  if (glide) {
    const prefix = glide.split("-")[0]?.toUpperCase();
    if (prefix && GLIDE_PREFIX_MAP[prefix]) return GLIDE_PREFIX_MAP[prefix];
  }
  for (const [pattern, hazardType] of TITLE_KEYWORD_MAP) {
    if (pattern.test(title)) return hazardType;
  }
  return "Other"; // ADR 0008: no GDACS-equivalent -- never cross-matched
}

/** id slug from the disaster's permanent URL, e.g.
 *  "https://reliefweb.int/disaster/eq-2026-000093-ven" -> "eq-2026-000093-ven". */
function slugFromLink(link: string): string {
  const parts = link.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? link;
}

interface ReliefWebItem {
  title: string;
  link: string;
  pubDateUtc: string;
  glide: string | null;
  country: string | null;
}

function parseItems(xml: string): ReliefWebItem[] {
  const items: ReliefWebItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    const title = decodeEntities(extractTag(block, "title") ?? "");
    const link = extractTag(block, "link") ?? "";
    const pubDateRaw = extractTag(block, "pubDate");
    const descriptionRaw = extractTag(block, "description") ?? "";
    const description = decodeEntities(descriptionRaw);

    if (!title || !link || !pubDateRaw) continue; // malformed item -- skip, don't crash the run

    const glideText = extractTaggedDiv(description, "glide");
    const countryText = extractTaggedDiv(description, "country");

    items.push({
      title,
      link,
      pubDateUtc: new Date(pubDateRaw).toISOString(),
      glide: glideText ? glideText.replace(/^Glide:\s*/i, "").trim() || null : null,
      country: countryText ? countryText.replace(/^Affected countr(y|ies):\s*/i, "").trim() || null : null,
    });
  }

  return items;
}

function toFeedEvent(item: ReliefWebItem): FeedEvent {
  const hazardType = deriveHazardType(item.glide, item.title);
  return {
    feed: "reliefweb",
    hazardType,
    sourceIds: [slugFromLink(item.link)],
    episodeId: null,
    glide: item.glide,
    occurredAtUtc: item.pubDateUtc,
    place: item.country ?? item.title,
    location: { type: "Point", coordinates: centroidFor(item.country) },
    estimate: {},
    rawPayload: item,
  };
}

export interface ReliefWebIngestResult {
  events: FeedEvent[];
  rawResponse: string;
}

export async function fetchReliefWebEvents(): Promise<ReliefWebIngestResult> {
  const res = await fetch(RSS_URL);
  if (!res.ok) {
    throw new Error(`ReliefWeb fetch failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const items = parseItems(xml);

  return {
    events: items.map(toFeedEvent),
    rawResponse: xml,
  };
}
