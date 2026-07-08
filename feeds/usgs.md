# USGS Earthquakes

United States Geological Survey real-time earthquake feed. GeoJSON, regenerated
every minute, served as rolling windows.

## Endpoint

Verified 6 Jul 2026:

    https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson

Other windows and magnitude cut-offs exist (`all_hour`, `4.5_week`,
`significant_month`, …) — same shape throughout.

## Example response (truncated)

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "generated": 1783342886000,
    "title": "USGS All Earthquakes, Past Day",
    "count": 208
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "mag": 3.04,
        "place": "9 km NNE of Avalon, CA",
        "time": 1783342082180,
        "updated": 1783342799040,
        "felt": 1,
        "alert": null,
        "status": "automatic",
        "tsunami": 0,
        "sig": 143,
        "ids": ",ci41287863,us6000tafd,",
        "type": "earthquake",
        "title": "M 3.0 - 9 km NNE of Avalon, CA"
      },
      "geometry": { "type": "Point", "coordinates": [-118.3, 33.4, 12.1] },
      "id": "ci41287863"
    }
  ]
}
```

## Findings (verified live, 7 Jul 2026)

1. **Events are revised after publication.** The example event above
   (`ci41287863`) was M 3.04 when captured on 6 Jul; the live feed shows it at
   M 3.22 on 7 Jul. `status` moves `automatic` → `reviewed` (137 vs 70 in
   today's feed). Events are occasionally deleted outright — and in the summary
   feed a deleted event just vanishes, indistinguishable from one that aged out
   of the window. The canonical store is the FDSN query API
   (`https://earthquake.usgs.gov/fdsnws/event/1/`), which can return deleted
   events explicitly.
2. **This is a rolling window, not a stream.** `all_day` = "the past 24 h",
   regenerated every minute. Diffing two snapshots cannot distinguish
   resolved / aged-out / deleted. Change detection needs our own state store
   keyed by event.
3. **`id` is unstable.** Multiple seismic networks report the same quake;
   `id` is the currently *preferred* one and can switch networks between
   fetches (seen live: an event with `id: hv74997846` listing `us6000tadx`
   first in `ids`). Store the full `ids` list and match on intersection —
   keying on `id` alone double-counts.
4. **Mostly noise at this window.** 7 Jul: 207 events, 157 below M 2.0, only
   12 at M 4.5+. Coverage is US-biased (dense instrumentation) with a global
   detection floor around M 4.5. `type` is not always `earthquake` — today's
   feed includes an `explosion`; quarry blasts and ice quakes occur too.
   Consider `4.5_day` or `significant_week` instead of `all_day`.
5. **Magnitude is not impact.** The humanitarian signal is the PAGER `alert`
   field (`green`/`yellow`/`orange`/`red`, an estimated-losses model — the
   same idea as GDACS's colours), but it is `null` for almost every event and
   arrives late. `tsunami: 1` means "in a tsunami-flagged sea region", not
   "a tsunami happened".
6. Timestamps (`time`, `updated`) are **epoch milliseconds, UTC**.

## Open questions

1. What happens to a report we have already published when its event is
   revised or deleted underneath it — silent correction, or an explicit
   erratum in the next sitrep?
