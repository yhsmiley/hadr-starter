// ReliefWeb's RSS feed carries no geometry at all (feeds/reliefweb.md --
// only a country name div). These centroids are display-only: they let
// src/render/dashboard.ts show *a* point on the map/coordinates line, and
// are never read by the fusion engine's matching logic (src/fusion/fuse.ts
// attaches ReliefWeb events by GLIDE or place-name, never by geo radius --
// a country centroid is far too coarse for a real proximity check).
// Approximate [lon, lat], intentionally not survey-precision.
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  afghanistan: [67.71, 33.94],
  armenia: [45.04, 40.07],
  australia: [133.78, -25.27],
  bangladesh: [90.36, 23.68],
  botswana: [24.68, -22.33],
  bolivia: [-63.59, -16.29],
  brazil: [-51.93, -14.24],
  cameroon: [12.35, 7.37],
  "central african republic": [20.94, 6.61],
  chad: [18.73, 15.45],
  chile: [-71.54, -35.68],
  china: [104.2, 35.86],
  colombia: [-74.3, 4.57],
  cuba: [-77.78, 21.52],
  "democratic republic of the congo": [21.76, -4.04],
  "dominican republic": [-70.16, 18.74],
  ecuador: [-78.18, -1.83],
  "el salvador": [-88.9, 13.79],
  eritrea: [39.78, 15.18],
  ethiopia: [40.49, 9.15],
  fiji: [178.07, -17.71],
  georgia: [43.36, 42.32],
  guatemala: [-90.23, 15.78],
  guinea: [-9.7, 9.95],
  "guinea-bissau": [-15.18, 11.8],
  haiti: [-72.29, 18.97],
  honduras: [-86.24, 15.2],
  india: [78.96, 20.59],
  indonesia: [113.92, -0.79],
  iran: [53.69, 32.43],
  iraq: [43.68, 33.22],
  japan: [138.25, 36.2],
  kenya: [37.91, -0.02],
  kyrgyzstan: [74.77, 41.2],
  laos: [102.5, 19.86],
  lebanon: [35.86, 33.85],
  liberia: [-9.43, 6.43],
  libya: [17.23, 26.34],
  madagascar: [46.87, -18.77],
  malawi: [34.3, -13.25],
  mali: [-3.99, 17.57],
  mauritania: [-10.94, 21.01],
  mexico: [-102.55, 23.63],
  morocco: [-7.09, 31.79],
  mozambique: [35.53, -18.67],
  myanmar: [95.96, 21.91],
  namibia: [18.49, -22.96],
  nepal: [84.12, 28.39],
  nicaragua: [-85.21, 12.87],
  niger: [8.08, 17.61],
  nigeria: [8.68, 9.08],
  pakistan: [69.35, 30.38],
  palestine: [35.23, 31.95],
  panama: [-80.78, 8.54],
  "papua new guinea": [143.96, -6.31],
  peru: [-75.02, -9.19],
  philippines: [121.77, 12.88],
  rwanda: [29.87, -1.94],
  "sierra leone": [-11.78, 8.46],
  "solomon islands": [160.16, -9.65],
  somalia: [46.2, 5.15],
  "south sudan": [31.31, 6.88],
  "sri lanka": [80.77, 7.87],
  sudan: [30.22, 12.86],
  syria: [38.99, 34.8],
  tajikistan: [71.28, 38.86],
  tanzania: [34.89, -6.37],
  "timor-leste": [125.73, -8.87],
  togo: [0.82, 8.62],
  tonga: [-175.2, -21.18],
  tunisia: [9.54, 33.89],
  turkey: [35.24, 38.96],
  uganda: [32.29, 1.37],
  ukraine: [31.17, 48.38],
  "united states": [-95.71, 37.09],
  uzbekistan: [64.59, 41.38],
  vanuatu: [166.96, -15.38],
  venezuela: [-66.59, 6.42],
  vietnam: [108.28, 14.06],
  yemen: [48.52, 15.55],
  zambia: [27.85, -13.13],
  zimbabwe: [29.15, -19.02],
};

/** Case-insensitive substring lookup -- ReliefWeb's country div carries
 *  extra qualifiers (e.g. "Venezuela (Bolivarian Republic of)") that a
 *  strict equality check would miss. Picks the *longest* matching key so
 *  a more specific name (e.g. "guinea-bissau") wins over a shorter one
 *  that's also a substring of it (e.g. "guinea"). Returns [0, 0] (logged)
 *  when no known country name is found. */
export function centroidFor(countryText: string | null): [number, number] {
  if (countryText) {
    const lower = countryText.toLowerCase();
    let best: [number, number] | null = null;
    let bestLength = -1;
    for (const [name, coords] of Object.entries(COUNTRY_CENTROIDS)) {
      if (lower.includes(name) && name.length > bestLength) {
        best = coords;
        bestLength = name.length;
      }
    }
    if (best) return best;
  }
  console.warn(`ReliefWeb: no centroid known for country "${countryText}" -- defaulting to [0, 0]`);
  return [0, 0];
}
