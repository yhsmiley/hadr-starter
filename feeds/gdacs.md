# GDACS

Global Disaster Alert and Coordination System (EU/UN). Multi-hazard: earthquakes,
cyclones, floods, volcanoes, drought, wildfires. Each event carries a colour-coded
alert level.

## Endpoint

GeoJSON event list (verified 6 Jul 2026):

    https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP

RSS alternative: `https://www.gdacs.org/xml/rss.xml`. Per-event detail hangs off
`url.details` inside each feature.

## Example response (truncated)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [141.845, 40.4353] },
      "properties": {
        "eventtype": "EQ",
        "eventid": 1550421,
        "episodeid": 1716583,
        "glide": "",
        "name": "Earthquake in Japan",
        "htmldescription": "Green M 4.6 Earthquake in Japan at: 06 Jul 2026 11:29:36.",
        "alertlevel": "Green",
        "alertscore": 1,
        "episodealertlevel": "Green",
        "episodealertscore": 0.0,
        "istemporary": "false",
        "iscurrent": "true",
        "country": "Japan",
        "fromdate": "2026-07-06T11:29:36",
        "todate": "2026-07-06T11:29:36",
        "datemodified": "2026-07-06T12:09:48",
        "iso3": "JPN",
        "source": "NEIC",
        "url": {
          "report": "https://www.gdacs.org/report.aspx?eventid=1550421&episodeid=1716583&eventtype=EQ",
          "details": "https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=EQ&eventid=1550421"
        }
      }
    }
  ]
}
```

## Findings (verified live, 7 Jul 2026)

1. **GDACS is an aggregator, not an independent sensor.** All 15 earthquakes
   in today's feed have `source: NEIC` — the same agency behind the USGS feed.
   Cross-checking GDACS earthquakes against USGS is not corroboration; dedup
   between the two is every earthquake, not an edge case. What GDACS adds is
   the impact model (colours reflect modeled population exposure, not
   magnitude — a M 6.2 under a city outranks a M 7.5 offshore) and coverage
   of non-quake hazards.
2. **Events contain episodes, and their colours disagree.** Live today:
   Tropical Cyclone BAVI-26 is `alertlevel: Red` (worst-so-far for the event)
   but `episodealertlevel: Orange` (current episode). A colour can escalate or
   fade after we have reported it.
3. **`datemodified` is useless as a change signal**: 87 of 100 events were
   "modified" today. Change detection must diff the fields we care about
   (alert level, magnitude, `todate`), never timestamps.
4. **The endpoint returned exactly 100 features** — likely an undocumented
   cap. `EVENTS4APP` is the internal endpoint of their mobile app: no version
   contract, no SLA, no docs; it can change shape silently. Log raw responses
   so schema drift is diagnosable.
5. **Long-running events dominate.** 78 of 100 events today are wildfires;
   the oldest open event started 6 Jun. `fromdate`/`todate` extend daily, and
   the same hazard ("Forest fires in Canada") appears as several events with
   overlapping date ranges. The distinction that matters for reporting is
   *new event* vs *new episode of an ongoing event*.
6. **Geometry lies for non-earthquakes.** The point on a flood, fire or
   drought is the centroid of a large area; cyclones have tracks (under
   `url.details`). Do not map these points as epicentres.
7. **`glide` is empty on 98 of 100 events.** It is assigned late and only to
   humanitarian-significant events — it confirms a cross-feed match but
   cannot make one.
8. Timestamps are **naive but UTC** (`2026-07-06T11:29:36`, no zone suffix) —
   do not let a parser assume local time.

## Open questions

1. Which colour drives the sitrep — event `alertlevel` or
   `episodealertlevel` — and what do we publish when one changes after we
   have reported the other?
2. GDACS publishes no rate limits and no uptime guarantees. What is a polite
   polling frequency, and what does your 08:30 report say on a morning the
   feed is down?
3. Is the 100-feature response a hard cap, and if so, how do we page or
   filter to make sure a busy day does not silently truncate?
