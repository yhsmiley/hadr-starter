# ReliefWeb

UN OCHA's humanitarian information service. Curated and slower-moving than the
other two feeds: a "disaster" appears here once humans decide it matters.

## Endpoint

    https://api.reliefweb.int/v2/disasters?appname=<your-approved-appname>&preset=latest

Two things to know, both verified 6 Jul 2026:

- `v1` has been decommissioned; it returns HTTP 410.
- Since 1 November 2025 the API requires a **pre-approved** `appname`,
  requested via a form and confirmed by email:
  https://apidoc.reliefweb.int/parameters#appname

Without an approved appname:

```json
{
  "status": 403,
  "error": {
    "type": "AccessDeniedHttpException",
    "message": "You are not using an approved appname. Kindly request an appname from ReliefWeb here: https://apidoc.reliefweb.int/parameters#appname"
  }
}
```

The RSS feed needs no approval:

    https://reliefweb.int/disasters/rss.xml

## Example response (truncated, from the RSS feed)

```xml
<item>
  <title>Venezuela: Earthquakes - Jun 2026</title>
  <link>https://reliefweb.int/disaster/eq-2026-000093-ven</link>
  <pubDate>Wed, 24 Jun 2026 00:00:00 +0000</pubDate>
  <description>
    &lt;div class="tag country"&gt;Affected country: Venezuela (Bolivarian Republic of)&lt;/div&gt;
    &lt;div class="tag glide"&gt;Glide: EQ-2026-000093-VEN&lt;/div&gt;
    &lt;p&gt;On 24 June 2026, two strong earthquakes, preliminarily measured at
    magnitudes 7.1 and 7.5, struck north-central Venezuela in rapid
    succession, with epicentres near Morón, Carabobo State. ...&lt;/p&gt;
  </description>
</item>
```

## Findings (verified live, 7 Jul 2026)

1. **This is a curated registry of crises, not an event feed.** One
   "disaster" record per crisis, created when OCHA humans decide it matters.
   That is why it carries things instruments never see (the current RSS
   includes an Ebola outbreak, a dengue outbreak and a hailstorm) and misses
   everything small. Treat it as ground truth for *"does this matter
   humanitarianly"*, not for detection.
2. **Latency is days to weeks.** The newest item in the RSS on 7 Jul is dated
   24 Jun — 13 days old. ReliefWeb will never trigger a morning alert; its
   role is enrichment, confirmation and the "who is affected" narrative for
   events we already know about.
3. **The RSS is a degraded view of the API.** `pubDate` is the
   record-creation date pinned to 00:00 (not the event time), records are
   updated after creation with no RSS signal, and the payload is HTML blobs.
   The API adds structured `status` (`alert`/`ongoing`/`past`), GLIDE, ISO3
   country codes, and the much higher-volume `reports` stream.
4. **Apply for the appname immediately.** Approval-by-email latency is the
   one critical-path item that cannot be parallelised. Build against the RSS
   meanwhile.
5. **GLIDE numbers are reliably present here** (in the `tag glide` div of
   each RSS item), unlike GDACS where they are mostly empty — this is the
   strongest cross-feed link once a disaster is significant enough to have
   one.

## Open questions

1. The API docs say usage is monitored and adapted per application. What are
   the actual limits, and how should your agent behave when it hits one?
2. Once the appname is approved, does the `disasters` endpoint's `changed`
   date give us the update signal the RSS lacks?
