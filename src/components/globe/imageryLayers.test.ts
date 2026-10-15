import { describe, expect, it } from 'vitest';
import { isAllowedLayer } from '@/server/providers/imagery';
import {
  GIBS_MAXIMUM_LEVEL,
  GIBS_PROVIDER_DESCRIPTOR,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  buildGibsTimeDimension,
} from './cesiumConfig';
import {
  CESIUM_GRATICULE_OVERLAY_LAYER,
  DEFAULT_BASE_LAYER_ID,
  GIBS_TRUE_COLOR_BASE_LAYER,
  IMAGERY_LAYER_REGISTRY,
  IMAGERY_URL_PARAM,
  OVERLAY_LAYERS,
  BASE_IMAGERY_LAYERS,
  clampLayerOpacity,
  findLayerDescriptor,
  isSupportedBaseLayerId,
  parseImageryUrlValue,
  parseLayerOpacity,
  resolveBaseLayerId,
} from './imageryLayers';

describe('imagery layer registry (Phase 4)', () => {
  it('exposes unique, stable, URL-safe layer ids', () => {
    const ids = IMAGERY_LAYER_REGISTRY.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('carries complete metadata for every layer', () => {
    for (const layer of IMAGERY_LAYER_REGISTRY) {
      expect(layer.name.length).toBeGreaterThan(0);
      expect(layer.description.length).toBeGreaterThan(0);
      expect(['base', 'overlay'] as const).toContain(layer.role);
      expect(layer.providerId.length).toBeGreaterThan(0);
      expect(layer.defaultOpacity).toBeGreaterThanOrEqual(0);
      expect(layer.defaultOpacity).toBeLessThanOrEqual(1);
    }
  });

  it('categorizes exactly one verified base and the graticule overlay', () => {
    expect(BASE_IMAGERY_LAYERS).toHaveLength(1);
    expect(BASE_IMAGERY_LAYERS[0].id).toBe('gibs-modis-truecolor');
    expect(BASE_IMAGERY_LAYERS[0].role).toBe('base');
    expect(OVERLAY_LAYERS).toHaveLength(1);
    expect(OVERLAY_LAYERS[0].id).toBe('cesium-graticule');
    expect(OVERLAY_LAYERS[0].role).toBe('overlay');
    expect(DEFAULT_BASE_LAYER_ID).toBe('gibs-modis-truecolor');
  });

  it('does not advertise unsupported capabilities', () => {
    for (const layer of IMAGERY_LAYER_REGISTRY) {
      // Single base pinned to the bottom + single overlay above it: no
      // meaningful ordering choice exists, so no control is exposed.
      expect(layer.supportsReordering).toBe(false);
    }
    expect(GIBS_TRUE_COLOR_BASE_LAYER.supportsOpacity).toBe(true);
    expect(CESIUM_GRATICULE_OVERLAY_LAYER.supportsOpacity).toBe(true);
  });

  it('keeps the base descriptor consistent with the verified provider configuration', () => {
    // The runtime consumes cesiumConfig constants; this registry only
    // describes them. The test pins the two together so neither drifts.
    expect(GIBS_TRUE_COLOR_BASE_LAYER.id).toBeDefined();
    expect(GIBS_PROVIDER_DESCRIPTOR.productId).toBe('MODIS_Terra_CorrectedReflectance_TrueColor');
    expect(isAllowedLayer(GIBS_PROVIDER_DESCRIPTOR.productId)).toBe(true);
    expect(GIBS_PROVIDER_DESCRIPTOR.endpoint).toBe(GIBS_WMTS_URL);
    expect(GIBS_PROVIDER_DESCRIPTOR.tileMatrixSet).toBe(GIBS_TILE_MATRIX_SET_ID);
    expect(GIBS_MAXIMUM_LEVEL).toBe(9);
    expect(GIBS_TRUE_COLOR_BASE_LAYER.providerId).toBe('nasa-gibs');
    expect(GIBS_TRUE_COLOR_BASE_LAYER.attribution).toMatch(/GIBS/);
    // Temporal honesty: daily composite, never live observation.
    expect(GIBS_TRUE_COLOR_BASE_LAYER.temporalNote).toMatch(/daily composite/i);
    expect(GIBS_TRUE_COLOR_BASE_LAYER.temporalNote).toMatch(/not live/i);
    // The configured TIME dimension is a calendar day, not a timestamp.
    const { Time } = buildGibsTimeDimension(new Date('2026-10-15T12:00:00Z'));
    expect(Time).toBe('2026-10-15');
  });

  it('exposes no secrets or provider URLs in serializable metadata', () => {
    const serialized = JSON.stringify(IMAGERY_LAYER_REGISTRY);
    // Credential-shaped content only ("Token-free" and "keyed by" are
    // honest prose, not secrets — the pattern requires an assignment or a
    // known secret field name).
    expect(serialized).not.toMatch(
      /api[_-]?key|secret|password|credential|bearer\s|token\s*[:=]/i,
    );
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');
  });

  it('names the URL parameter used for the base selection', () => {
    expect(IMAGERY_URL_PARAM).toBe('imagery');
  });
});

describe('imagery layer state validation (Phase 4)', () => {
  it('accepts only registered base ids', () => {
    expect(isSupportedBaseLayerId('gibs-modis-truecolor')).toBe(true);
    expect(isSupportedBaseLayerId('cesium-graticule')).toBe(false);
    expect(isSupportedBaseLayerId('ndvi')).toBe(false);
    expect(isSupportedBaseLayerId('')).toBe(false);
    expect(isSupportedBaseLayerId(null)).toBe(false);
    expect(isSupportedBaseLayerId(undefined)).toBe(false);
    expect(isSupportedBaseLayerId(42)).toBe(false);
  });

  it('resolves unknown or removed ids to the verified default', () => {
    expect(resolveBaseLayerId('gibs-modis-truecolor')).toBe('gibs-modis-truecolor');
    expect(resolveBaseLayerId('sentinel-2')).toBe(DEFAULT_BASE_LAYER_ID);
    expect(resolveBaseLayerId('')).toBe(DEFAULT_BASE_LAYER_ID);
    expect(resolveBaseLayerId(null)).toBe(DEFAULT_BASE_LAYER_ID);
    expect(resolveBaseLayerId('https://evil.example/tiles')).toBe(DEFAULT_BASE_LAYER_ID);
  });

  it('parses the imagery URL value to a supported id or null', () => {
    expect(parseImageryUrlValue('gibs-modis-truecolor')).toBe('gibs-modis-truecolor');
    expect(parseImageryUrlValue('unknown-layer')).toBeNull();
    expect(parseImageryUrlValue('')).toBeNull();
    expect(parseImageryUrlValue(null)).toBeNull();
    expect(parseImageryUrlValue(undefined)).toBeNull();
  });

  it('finds descriptors by stable id', () => {
    expect(findLayerDescriptor('gibs-modis-truecolor')?.name).toContain('GIBS');
    expect(findLayerDescriptor('cesium-graticule')?.role).toBe('overlay');
    expect(findLayerDescriptor('nope')).toBeUndefined();
  });

  it('clamps opacity into the valid 0–1 range', () => {
    expect(clampLayerOpacity(0)).toBe(0);
    expect(clampLayerOpacity(1)).toBe(1);
    expect(clampLayerOpacity(0.35)).toBeCloseTo(0.35);
    expect(clampLayerOpacity(-0.5)).toBe(0);
    expect(clampLayerOpacity(2)).toBe(1);
    expect(clampLayerOpacity(NaN)).toBe(1);
    expect(clampLayerOpacity(Infinity)).toBe(1);
    expect(clampLayerOpacity('0.5')).toBeCloseTo(0.5);
    expect(clampLayerOpacity('junk')).toBe(1);
  });

  it('rejects unusable persisted opacity with the layer default', () => {
    expect(parseLayerOpacity(0.5, 1)).toBeCloseTo(0.5);
    expect(parseLayerOpacity(0, 1)).toBe(0);
    expect(parseLayerOpacity(1, 1)).toBe(1);
    // Missing input means "no choice stored" — the default applies.
    expect(parseLayerOpacity(null, 0.8)).toBe(0.8);
    expect(parseLayerOpacity(undefined, 0.8)).toBe(0.8);
    expect(parseLayerOpacity('', 0.8)).toBe(0.8);
    // Out-of-range or non-numeric input is discarded, never clamped into
    // a surprising value.
    expect(parseLayerOpacity(-1, 0.8)).toBe(0.8);
    expect(parseLayerOpacity(2, 0.8)).toBe(0.8);
    expect(parseLayerOpacity(NaN, 0.8)).toBe(0.8);
    expect(parseLayerOpacity('junk', 0.8)).toBe(0.8);
  });

  it('pins the registry default to the verified base', () => {
    expect(DEFAULT_BASE_LAYER_ID).toBe(GIBS_TRUE_COLOR_BASE_LAYER.id);
    expect(isSupportedBaseLayerId(DEFAULT_BASE_LAYER_ID)).toBe(true);
  });
});
