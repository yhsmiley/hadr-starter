// V3 (SLICES.md): the fusion behaviors that only exist once GDACS's full
// hazard taxonomy, ReliefWeb, and cross-run re-evaluation are all live --
// Cyclone/default-window matching, the two humanitarian confidence tiers
// (ADR 0002), GLIDE relabeling (ADR 0004/A3.7), per-hazard-type closing
// authority (ADR 0003), `Other`'s never-cross-matched guarantee (ADR
// 0008), and un-merge/re-merge (ADR 0004/A3.6). Assertions target
// structured Incident fields only, same PRD priority as fusion.test.ts --
// never narrative prose.
import assert from "assert";
import { fuse } from "../src/fusion/fuse";
import { Feed, FeedEvent, HazardType, Incident } from "../src/types";

let n = 0;
function event(opts: {
  feed: Feed;
  hazardType: HazardType;
  ids: string[];
  occurredAtUtc: string;
  lon: number;
  lat: number;
  place?: string;
  glide?: string | null;
  mag?: number;
  gdacsAlertLevel?: "Green" | "Orange" | "Red" | null;
  gdacsIsCurrent?: boolean;
  pagerAlert?: "green" | "yellow" | "orange" | "red" | null;
}): FeedEvent {
  n += 1;
  return {
    feed: opts.feed,
    hazardType: opts.hazardType,
    sourceIds: opts.ids,
    episodeId: null,
    glide: opts.glide ?? null,
    occurredAtUtc: opts.occurredAtUtc,
    place: opts.place ?? `test place ${n}`,
    location: { type: "Point", coordinates: [opts.lon, opts.lat, 10] },
    estimate: {
      magnitude: opts.mag,
      pagerAlert: opts.pagerAlert ?? null,
      gdacsAlertLevel: opts.gdacsAlertLevel ?? null,
      gdacsIsCurrent: opts.gdacsIsCurrent,
    },
    rawPayload: {},
  };
}

function bareIncident(overrides: Partial<Incident> & Pick<Incident, "id" | "hazardType" | "memberEvents">): Incident {
  return {
    state: "new",
    confidenceTier: "single-source (USGS)",
    glide: null,
    impactEstimates: [],
    erratumLog: [],
    narrative: null,
    ...overrides,
  };
}

export async function run(): Promise<void> {
  const NOW = "2026-07-08T00:00:00.000Z";

  // 1. Cyclone: GDACS's own tuned window (500km, 21 days) merges two
  //    episodes of the same storm's track, which Earthquake's 150km
  //    radius would have rejected.
  {
    const first = event({
      feed: "gdacs",
      hazardType: "Cyclone",
      ids: ["c1"],
      occurredAtUtc: NOW,
      lon: 130,
      lat: 15,
      gdacsAlertLevel: "Orange",
      gdacsIsCurrent: true,
    });
    const afterFirst = fuse([first], [], NOW);
    assert.strictEqual(afterFirst.length, 1);
    assert.strictEqual(afterFirst[0].confidenceTier, "single-source (GDACS)");

    const laterIso = new Date(new Date(NOW).getTime() + 5 * 24 * 3_600_000).toISOString(); // +5 days
    const trackMoved = event({
      feed: "gdacs",
      hazardType: "Cyclone",
      ids: ["c2"],
      occurredAtUtc: laterIso,
      lon: 133, // ~320km east -- within Cyclone's 500km, would fail Earthquake's 150km
      lat: 15,
      gdacsAlertLevel: "Red",
      gdacsIsCurrent: true,
    });
    const afterMoved = fuse([trackMoved], afterFirst, laterIso);
    assert.strictEqual(afterMoved.length, 1, "a cyclone's moved track must roll into the same Incident under its own window");
    assert.strictEqual(afterMoved[0].memberEvents.length, 2);
    assert.strictEqual(afterMoved[0].state, "escalated", "a distinct new episode joining the Incident escalates it");
  }

  // 2. Flood (default window, ADR 0001): no magnitude floor -- a single
  //    GDACS Flood event creates a new Incident immediately, unlike
  //    Earthquake's M4.5 floor.
  {
    const flood = event({
      feed: "gdacs",
      hazardType: "Flood",
      ids: ["f1"],
      occurredAtUtc: NOW,
      lon: 90,
      lat: 24,
      gdacsAlertLevel: "Green",
      gdacsIsCurrent: true,
    });
    const incidents = fuse([flood], [], NOW);
    assert.strictEqual(incidents.length, 1, "GDACS hazard types other than Earthquake have no new-Incident magnitude floor");
    assert.strictEqual(incidents[0].hazardType, "Flood");
  }

  // 3. humanitarian-confirmed: a ReliefWeb record with no matching
  //    instrument Incident (different place entirely) is its own
  //    standalone Incident, tier humanitarian-confirmed.
  {
    const rw = event({
      feed: "reliefweb",
      hazardType: "Earthquake",
      ids: ["eq-2026-000200-xyz"],
      occurredAtUtc: NOW,
      lon: 0,
      lat: 0,
      place: "Nowhereland",
      glide: "EQ-2026-000200-XYZ",
    });
    const incidents = fuse([rw], [], NOW);
    assert.strictEqual(incidents.length, 1);
    assert.strictEqual(incidents[0].confidenceTier, "humanitarian-confirmed");
    assert.strictEqual(incidents[0].glide, "EQ-2026-000200-XYZ");
  }

  // 4. humanitarian+instrument + glide-relabel erratum: a USGS-only
  //    earthquake Incident later gets ReliefWeb confirmation for the same
  //    place -- confidence upgrades and the upgrade is an explicit erratum
  //    (ADR 0004), never silent.
  {
    const usgsQuake = event({
      feed: "usgs",
      hazardType: "Earthquake",
      ids: ["us-morocco-1"],
      occurredAtUtc: NOW,
      lon: -7,
      lat: 31,
      place: "12 km SE of Marrakesh, Morocco",
      mag: 6.1,
    });
    const afterUsgs = fuse([usgsQuake], [], NOW);
    assert.strictEqual(afterUsgs[0].confidenceTier, "single-source (USGS)");

    const laterIso = new Date(new Date(NOW).getTime() + 5 * 24 * 3_600_000).toISOString();
    const rwConfirm = event({
      feed: "reliefweb",
      hazardType: "Earthquake",
      ids: ["eq-2026-000300-mar"],
      occurredAtUtc: laterIso,
      lon: 0,
      lat: 0, // ReliefWeb has no real geometry -- place-name is what matches
      place: "Morocco",
      glide: "EQ-2026-000300-MAR",
    });
    const afterConfirm = fuse([rwConfirm], afterUsgs, laterIso);

    assert.strictEqual(afterConfirm.length, 1, "ReliefWeb confirmation must attach, not create a second Incident");
    assert.strictEqual(afterConfirm[0].confidenceTier, "humanitarian+instrument");
    assert.strictEqual(afterConfirm[0].glide, "EQ-2026-000300-MAR");
    const relabel = afterConfirm[0].erratumLog.find((e) => e.kind === "glide-relabel");
    assert.ok(relabel, "confidence upgrade must be logged as an explicit erratum, never silent");
    assert.ok(/upgraded from single-source \(USGS\) to humanitarian\+instrument/.test(relabel!.description));
  }

  // 5. `Other` is never cross-matched (ADR 0008): two different ReliefWeb
  //    disease-outbreak records, same country, same day, must remain two
  //    separate Incidents -- never merged just because they share a place.
  {
    const outbreakA = event({
      feed: "reliefweb",
      hazardType: "Other",
      ids: ["ep-2026-000001-cod"],
      occurredAtUtc: NOW,
      lon: 0,
      lat: 0,
      place: "Democratic Republic of the Congo",
    });
    const outbreakB = event({
      feed: "reliefweb",
      hazardType: "Other",
      ids: ["ep-2026-000002-cod"],
      occurredAtUtc: NOW,
      lon: 0,
      lat: 0,
      place: "Democratic Republic of the Congo",
    });
    const incidents = fuse([outbreakA, outbreakB], [], NOW);
    assert.strictEqual(incidents.length, 2, "Other hazard records must never cross-match, even with the same place/time");
    assert.ok(incidents.every((i) => i.confidenceTier === "humanitarian-confirmed"));
  }

  // 6. Ongoing-hazard closing rule (ADR 0003): GDACS `iscurrent: false` on
  //    a refetch closes a Cyclone/Flood/Volcano/Drought/Wildfire Incident
  //    -- no fixed quiet-period timer like Earthquake.
  {
    const wildfire = event({
      feed: "gdacs",
      hazardType: "Wildfire",
      ids: ["wf1"],
      occurredAtUtc: NOW,
      lon: -120,
      lat: 55,
      gdacsAlertLevel: "Orange",
      gdacsIsCurrent: true,
    });
    const afterFirst = fuse([wildfire], [], NOW);
    assert.notStrictEqual(afterFirst[0].state, "closed");

    const laterIso = new Date(new Date(NOW).getTime() + 2 * 24 * 3_600_000).toISOString();
    const ended = event({
      feed: "gdacs",
      hazardType: "Wildfire",
      ids: ["wf1"],
      occurredAtUtc: laterIso,
      lon: -120,
      lat: 55,
      gdacsAlertLevel: "Orange",
      gdacsIsCurrent: false,
    });
    const afterEnded = fuse([ended], afterFirst, laterIso);
    assert.strictEqual(afterEnded[0].state, "closed", "iscurrent:false must close an ongoing-hazard Incident immediately");
  }

  // 7. Ongoing-hazard closing rule, the other trigger: the event drops out
  //    of GDACS's feed entirely (no refetch at all this run).
  {
    const drought = event({
      feed: "gdacs",
      hazardType: "Drought",
      ids: ["dr1"],
      occurredAtUtc: NOW,
      lon: 40,
      lat: 5,
      gdacsAlertLevel: "Green",
      gdacsIsCurrent: true,
    });
    const afterFirst = fuse([drought], [], NOW);
    const laterIso = new Date(new Date(NOW).getTime() + 1 * 24 * 3_600_000).toISOString();
    const afterDropped = fuse([], afterFirst, laterIso); // this run's GDACS fetch no longer contains dr1
    assert.strictEqual(afterDropped[0].state, "closed", "an ongoing-hazard Incident whose GDACS event vanished from the feed must close");
  }

  // 8. Un-merge (ADR 0004/A3.6): re-evaluated every run, even with no new
  //    incoming events -- two member Events that no longer satisfy the
  //    matching window must split.
  {
    const memberA = event({ feed: "usgs", hazardType: "Earthquake", ids: ["ua"], occurredAtUtc: NOW, lon: 0, lat: 0, mag: 5.0 });
    const memberB = event({ feed: "usgs", hazardType: "Earthquake", ids: ["ub"], occurredAtUtc: NOW, lon: 170, lat: -80, mag: 5.0 });
    const stale = bareIncident({
      id: "usgs-earthquake-stale",
      hazardType: "Earthquake",
      memberEvents: [memberA, memberB],
      state: "escalated",
    });
    const result = fuse([], [stale], NOW);
    assert.strictEqual(result.length, 2, "an Incident whose members no longer match the window must split");
    assert.ok(result.some((i) => i.erratumLog.some((e) => e.kind === "un-merged")), "the split must be logged as an explicit erratum");
  }

  // 9. Re-merge (ADR 0004/A3.6): two currently-separate Incidents whose
  //    members now satisfy the same matching window must merge.
  {
    const memberA = event({ feed: "usgs", hazardType: "Earthquake", ids: ["ra"], occurredAtUtc: NOW, lon: 5, lat: 5, mag: 5.0 });
    const memberB = event({ feed: "usgs", hazardType: "Earthquake", ids: ["rb"], occurredAtUtc: NOW, lon: 5.01, lat: 5.01, mag: 5.0 });
    const incA = bareIncident({ id: "inc-a", hazardType: "Earthquake", memberEvents: [memberA] });
    const incB = bareIncident({ id: "inc-b", hazardType: "Earthquake", memberEvents: [memberB] });
    const result = fuse([], [incA, incB], NOW);
    assert.strictEqual(result.length, 1, "two Incidents whose members now match the same window must re-merge");
    assert.strictEqual(result[0].memberEvents.length, 2);
    assert.ok(result[0].erratumLog.some((e) => e.kind === "re-merged"), "the merge must be logged as an explicit erratum");
  }
}
