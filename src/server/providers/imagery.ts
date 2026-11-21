/**
 * NASA GIBS imagery URL builder — port of backend/app/services/imagery.py.
 */
export interface GibsLayer {
  id: string;
  name: string;
  projection: string;
  format: string;
  tilematrixset: string;
  zoom_levels: number[];
}

export const GIBS_LAYERS: GibsLayer[] = [
  {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    name: "True Color",
    projection: "geographic",
    format: "image/jpeg",
    tilematrixset: "250m",
    zoom_levels: Array.from({ length: 9 }, (_, i) => i),
  },
  {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    name: "VIIRS True Color",
    projection: "geographic",
    format: "image/jpeg",
    tilematrixset: "250m",
    zoom_levels: Array.from({ length: 9 }, (_, i) => i),
  },
  {
    id: "MODIS_Terra_Brightness_Temp_Band31_Day",
    name: "Temperature",
    projection: "geographic",
    format: "image/png",
    tilematrixset: "1km",
    zoom_levels: Array.from({ length: 7 }, (_, i) => i),
  },
];

const LAYER_BY_ID = new Map(GIBS_LAYERS.map((l) => [l.id, l]));

const EXTENSION_BY_FORMAT: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
};

export function isAllowedLayer(layer: string): boolean {
  return LAYER_BY_ID.has(layer);
}

/**
 * [MatrixWidth, MatrixHeight] per level of the GIBS EPSG:4326 `250m` and
 * `1km` tile matrix sets (identical for shared levels), copied from the
 * WMTS GetCapabilities. Not powers of two: level 1 is 3×2, level 2 is 5×3.
 */
const GIBS_4326_MATRIX: ReadonlyArray<readonly [number, number]> = [
  [2, 1], [3, 2], [5, 3], [10, 5], [20, 10], [40, 20], [80, 40], [160, 80], [320, 160],
];

export function isValidTile(layer: string, z: number, x: number, y: number): boolean {
  const meta = LAYER_BY_ID.get(layer);
  if (!meta) return false;
  if (!meta.zoom_levels.includes(z)) return false;
  if (x < 0 || y < 0) return false;
  const [width, height] = GIBS_4326_MATRIX[z];
  return x < width && y < height;
}

export function buildTileUrl(
  baseUrl: string,
  layer: string,
  z: number,
  x: number,
  y: number,
  date?: string,
): string {
  const meta = LAYER_BY_ID.get(layer);
  if (!meta) throw new Error(`Imagery layer ${JSON.stringify(layer)} not found.`);
  // Previous UTC day: today's daily composite is incomplete (swath gaps).
  const day = date ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const ext = EXTENSION_BY_FORMAT[meta.format] ?? "jpeg";
  return (
    `${baseUrl.replace(/\/+$/, "")}/wmts/epsg4326/best/` +
    `${layer}/default/${day}/${meta.tilematrixset}/${z}/${y}/${x}.${ext}`
  );
}
