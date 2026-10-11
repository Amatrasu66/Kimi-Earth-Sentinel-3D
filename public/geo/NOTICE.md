# Base geography asset — source and licence

## `land-110m.json`

- **Dataset:** Natural Earth — `ne_110m_land` (1:110m scale land polygons).
- **Source repository:** <https://github.com/nvkelso/natural-earth-vector>
  (`geojson/ne_110m_land.geojson`), downloaded 2026-10-11.
- **Licence / terms:** Natural Earth is **public domain**. "You are free to
  use, modify, and distribute" — no permission required, no attribution
  required. Full terms: <https://www.naturalearthdata.com/about/terms-of-use/>.
- **Processing applied:** the downloaded GeoJSON was reduced to
  `{ type, features[].geometry }` — feature `properties`, per-feature
  `bbox`, the collection `crs` and `name` members were stripped, and the
  geometry coordinates were left untouched. No simplification, no
  reprojection (WGS 84 / EPSG:4326, i.e. plain lon/lat degrees).
- **Shape:** `FeatureCollection` of 127 `Polygon` features, ≈123 KB as
  served from `/geo/land-110m.json`.
- **Consumers:** `src/components/globe/dotted/landGeo.ts` (fetched at
  runtime from the same origin, cached for the session). Antarctica is
  included; inland water bodies are *not* cut out (Natural Earth land
  polygons already describe coastlines only).

Do not fetch this file from a third-party CDN at runtime — it is served
from `public/` so the base globe has no external runtime dependency.
