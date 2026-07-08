// The seam docs/PRD.md prioritizes: raw Events in, Incident list out,
// asserted on structured fields (state, tier, member count) -- never on
// narrative prose, which SHAPING.md's A5 explicitly excludes from
// determinism. Covers V1's analogues of the PRD's priority-coverage case
// (ADR 0002's shared-sensor distinction isn't reachable single-feed, but
// its V1 counterpart -- never spawning a *new* Incident below the ADR
// 0006 floor, and never losing a same-event refetch to id churn -- is
// exactly the class of bug a naive implementation gets wrong by default).
import assert from "assert";
import { fuse } from "../src/fusion/fuse";
import { FeedEvent } from "../src/types";

let n = 0;
function quake(opts: {
  ids: string[];
  mag: number;
  occurredAtUtc: string;
  lon: number;
  lat: number;
  place?: string;
  pagerAlert?: "green" | "yellow" | "orange" | "red" | null;
}): FeedEvent {
  n += 1;
  return {
    feed: "usgs",
    hazardType: "Earthquake",
    sourceIds: opts.ids,
    episodeId: null,
    occurredAtUtc: opts.occurredAtUtc,
    place: opts.place ?? `test place ${n}`,
    location: { type: "Point", coordinates: [opts.lon, opts.lat, 10] },
    estimate: { magnitude: opts.mag, pagerAlert: opts.pagerAlert ?? null },
    rawPayload: {},
  };
}

export async function run(): Promise<void> {
  const NOW = "2026-07-08T00:00:00.000Z";

  // 1. Below the ADR 0006 floor, no existing Incident to join -> dropped as noise.
  {
    const small = quake({ ids: ["us1"], mag: 2.1, occurredAtUtc: NOW, lon: 0, lat: 0 });
    const incidents = fuse([small], [], NOW);
    assert.strictEqual(incidents.length, 0, "sub-floor unmatched event must not spawn an Incident");
  }

  // 2. A single M5.0 event creates exactly one new, single-source Incident.
  {
    const mainshock = quake({ ids: ["us2"], mag: 5.0, occurredAtUtc: NOW, lon: 0, lat: 0 });
    const incidents = fuse([mainshock], [], NOW);
    assert.strictEqual(incidents.length, 1);
    assert.strictEqual(incidents[0].state, "new");
    assert.strictEqual(incidents[0].confidenceTier, "single-source (USGS)");
    assert.strictEqual(incidents[0].memberEvents.length, 1);
  }

  // 3. A sub-floor aftershock near an already-tracked mainshock rolls in
  //    (ADR 0001: "no magnitude floor" for aggregation), escalating the Incident.
  {
    const mainshock = quake({ ids: ["us3"], mag: 6.5, occurredAtUtc: NOW, lon: 10, lat: 10 });
    const afterMainshock = fuse([mainshock], [], NOW);

    const laterIso = new Date(new Date(NOW).getTime() + 3 * 3_600_000).toISOString(); // +3h
    const aftershock = quake({ ids: ["us3b"], mag: 3.2, occurredAtUtc: laterIso, lon: 10.01, lat: 10.01 });
    const afterAftershock = fuse([aftershock], afterMainshock, laterIso);

    assert.strictEqual(afterAftershock.length, 1, "aftershock must join the existing Incident, not spawn a new one");
    assert.strictEqual(afterAftershock[0].memberEvents.length, 2);
    assert.strictEqual(afterAftershock[0].state, "escalated");
  }

  // 4. The same physical event refetched under a different preferred id
  //    (USGS network switch, feeds/usgs.md finding 3) with a revised
  //    magnitude is a revision, not a new member -- and logs an erratum.
  {
    const original = quake({ ids: ["hv1", "us4"], mag: 5.0, occurredAtUtc: NOW, lon: 20, lat: 20 });
    const afterFirst = fuse([original], [], NOW);

    const laterIso = new Date(new Date(NOW).getTime() + 1 * 3_600_000).toISOString();
    const revised = quake({ ids: ["us4", "hv1"], mag: 5.3, occurredAtUtc: laterIso, lon: 20, lat: 20 });
    const afterRevision = fuse([revised], afterFirst, laterIso);

    assert.strictEqual(afterRevision.length, 1);
    assert.strictEqual(afterRevision[0].memberEvents.length, 1, "a refetch of the same event must replace, not add, a member");
    assert.strictEqual(afterRevision[0].state, "revised");
    assert.strictEqual(afterRevision[0].erratumLog.length, 1);
    assert.ok(/revised from 5/.test(afterRevision[0].erratumLog[0].description));
  }

  // 5. Two independent M5+ quakes far apart in time and space are two Incidents.
  {
    const a = quake({ ids: ["us5a"], mag: 5.1, occurredAtUtc: NOW, lon: 0, lat: 0 });
    const farLaterIso = new Date(new Date(NOW).getTime() + 40 * 24 * 3_600_000).toISOString(); // +40 days
    const b = quake({ ids: ["us5b"], mag: 5.2, occurredAtUtc: farLaterIso, lon: 150, lat: -30 });
    const incidents = fuse([a, b], [], farLaterIso);
    assert.strictEqual(incidents.length, 2, "distant, unrelated quakes must not be merged into one Incident");
  }

  // 6. Closing rule: quiet period elapsed -> Incident closes.
  {
    const mainshock = quake({ ids: ["us6"], mag: 5.5, occurredAtUtc: NOW, lon: 30, lat: 30 });
    const afterMainshock = fuse([mainshock], [], NOW);
    const muchLaterIso = new Date(new Date(NOW).getTime() + 45 * 24 * 3_600_000).toISOString(); // +45 days
    const afterQuiet = fuse([], afterMainshock, muchLaterIso);
    assert.strictEqual(afterQuiet.length, 1);
    assert.strictEqual(afterQuiet[0].state, "closed");
  }

  // 7. Pruning: an Incident closed long enough ago is dropped from state entirely.
  {
    const mainshock = quake({ ids: ["us7"], mag: 5.5, occurredAtUtc: NOW, lon: 40, lat: 40 });
    const afterMainshock = fuse([mainshock], [], NOW);
    const wayLaterIso = new Date(new Date(NOW).getTime() + 45 * 24 * 3_600_000).toISOString();
    const closed = fuse([], afterMainshock, wayLaterIso);
    assert.strictEqual(closed.length, 1, "sanity: still present right after closing");

    const evenLaterIso = new Date(new Date(NOW).getTime() + 130 * 24 * 3_600_000).toISOString(); // +130 days total
    const pruned = fuse([], closed, evenLaterIso);
    assert.strictEqual(pruned.length, 0, "long-closed Incidents must eventually drop out of state entirely");
  }
}

