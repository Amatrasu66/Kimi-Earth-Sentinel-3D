/**
 * T3.3 URL-state utility tests: parsing, validation, serialization.
 * Pure logic — no DOM, no network, fully deterministic.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_URL_STATE,
  isValidEventId,
  isValidSearchQuery,
  parseAppUrl,
  serializeAppState,
} from './url-state';

describe('parseAppUrl layers', () => {
  it('accepts a valid supported layer', () => {
    expect(parseAppUrl('?layer=earthquakes').state.layer).toBe('earthquakes');
    expect(parseAppUrl('layer=wildfires').state.layer).toBe('wildfires');
  });

  it('drops unknown, miscased, or empty layer values (never triggers provider calls)', () => {
    for (const search of ['?layer=nope', '?layer=Earthquakes', '?layer=', '?layer=earthquakes%20']) {
      expect(parseAppUrl(search).state.layer).toBeNull();
    }
    expect(parseAppUrl('').state.layer).toBeNull();
  });
});

describe('parseAppUrl events', () => {
  it('accepts well-formed event ids verbatim', () => {
    for (const id of ['usgs-12345', 'us7000abcd', 'eonet-123', 'fire-34.1--118.2', 'fire-10-20', 'wx-35.00--120.00', 'aqi-1-2', 'flood-001']) {
      expect(parseAppUrl(`?event=${encodeURIComponent(id)}`).state.event, id).toBe(id);
    }
  });

  it('rejects malformed event ids (traversal, charset, length, bad fire coords)', () => {
    const bad = [
      'a/b', '..', 'x'.repeat(129), 'with space', 'semi;colon', 'fire-abc',
      'fire-91-0', 'fire-0-181', 'fire-34.1-', 'fire-', 'fire-10',
    ];
    for (const id of bad) {
      expect(parseAppUrl(`?event=${encodeURIComponent(id)}`).state.event, id).toBeNull();
    }
    expect(parseAppUrl('').state.event).toBeNull();
  });
});

describe('parseAppUrl search query', () => {
  it('restores the trimmed query', () => {
    expect(parseAppUrl('?q=tokyo').state.q).toBe('tokyo');
    expect(parseAppUrl('?q=%20%20tokyo%20%20').state.q).toBe('tokyo');
  });

  it('supports Unicode and URL-encoded values round-trip', () => {
    const parsed = parseAppUrl(`?q=${encodeURIComponent('São Paulo')}`);
    expect(parsed.state.q).toBe('São Paulo');
    expect(parseAppUrl(`?q=${encodeURIComponent('a&b=c?d')}`).state.q).toBe('a&b=c?d');
    expect(parseAppUrl(`?q=${encodeURIComponent('北京')}`).state.q).toBe('北京');
  });

  it('drops too-short, over-long, and control-character queries', () => {
    expect(parseAppUrl('?q=a').state.q).toBe('');
    expect(parseAppUrl('?q=%20%20').state.q).toBe('');
    expect(parseAppUrl(`?q=${'x'.repeat(201)}`).state.q).toBe('');
    expect(parseAppUrl('?q=tokyo%0ADROP').state.q).toBe('');
    expect(isValidSearchQuery('tokyo')).toBe(true);
    expect(isValidSearchQuery('a')).toBe(false);
  });
});

describe('parseAppUrl severity and view', () => {
  it('accepts supported severity values, defaults the rest to all', () => {
    for (const sev of ['all', 'low', 'moderate', 'high', 'critical']) {
      expect(parseAppUrl(`?sev=${sev}`).state.sev).toBe(sev);
    }
    for (const sev of ['extreme', 'ALL', '', 'all '] ) {
      expect(parseAppUrl(`?sev=${encodeURIComponent(sev)}`).state.sev, sev).toBe('all');
    }
  });

  it('accepts globe and list, defaults anything else to globe', () => {
    expect(parseAppUrl('?view=list').state.view).toBe('list');
    expect(parseAppUrl('?view=globe').state.view).toBe('globe');
    expect(parseAppUrl('?view=map').state.view).toBe('globe');
    expect(parseAppUrl('').state.view).toBe('globe');
  });
});

describe('passthrough preservation', () => {
  it('preserves renderer and other unknown params verbatim and in order', () => {
    const parsed = parseAppUrl('?renderer=webgl&layer=earthquakes&utm_source=x&renderer=webgpu');
    expect(parsed.state.layer).toBe('earthquakes');
    // First wins per key; original encounter order kept.
    expect(parsed.passthrough).toEqual([['renderer', 'webgl'], ['utm_source', 'x']]);
  });

  it('round-trips unknown params through serialization', () => {
    const parsed = parseAppUrl('?layer=earthquakes&renderer=webgl');
    expect(serializeAppState(parsed.state, parsed.passthrough)).toBe('?layer=earthquakes&renderer=webgl');
  });
});

describe('serializeAppState determinism', () => {
  it('uses fixed order, omits defaults, and encodes correctly', () => {
    expect(serializeAppState(DEFAULT_URL_STATE)).toBe('');
    expect(
      serializeAppState({ layer: 'earthquakes', event: null, q: '', sev: 'all', view: 'globe', imagery: null }),
    ).toBe('?layer=earthquakes');
    expect(
      serializeAppState({ layer: 'earthquakes', event: 'eonet-1', q: 'fire & ice', sev: 'high', view: 'list', imagery: null }),
    ).toBe('?layer=earthquakes&event=eonet-1&q=fire+%26+ice&sev=high&view=list');
    // Known keys win over passthrough collisions.
    expect(
      serializeAppState({ ...DEFAULT_URL_STATE, layer: 'wind' }, [['layer', 'nope'], ['renderer', 'webgl']]),
    ).toBe('?layer=wind&renderer=webgl');
  });

  it('is deterministic for equivalent input URLs', () => {
    const a = parseAppUrl('?view=list&layer=earthquakes&q=tokyo');
    const b = parseAppUrl('layer=earthquakes&view=list&q=tokyo');
    expect(a.state).toEqual(b.state);
    expect(serializeAppState(a.state, a.passthrough)).toBe(serializeAppState(b.state, b.passthrough));
  });

  it('parse→serialize is a fixed point (loop-free history sync)', () => {
    for (const search of [
      '?layer=earthquakes&event=eonet-1&q=tokyo&sev=high&view=list&renderer=webgl',
      '?layer=nope&event=..&q=a&sev=extreme&view=map',
      '',
      '?utm=x',
      '?layer=earthquakes&imagery=gibs-modis-truecolor',
      '?imagery=nope',
    ]) {
      const once = serializeAppState(parseAppUrl(search).state, parseAppUrl(search).passthrough);
      const twice = serializeAppState(parseAppUrl(once).state, parseAppUrl(once).passthrough);
      expect(twice, search).toBe(once);
    }
  });

  it('drops invalid values on the floor (canonical form carries no junk)', () => {
    expect(serializeAppState(parseAppUrl('?layer=nope&event=..&q=a&sev=extreme&view=map').state, [])).toBe('');
  });
});

describe('parseAppUrl imagery (Phase 4)', () => {
  it('accepts a supported base imagery id', () => {
    expect(parseAppUrl('?imagery=gibs-modis-truecolor').state.imagery).toBe(
      'gibs-modis-truecolor',
    );
  });

  it('drops unknown, empty, or forged imagery values (never triggers provider calls)', () => {
    for (const search of [
      '?imagery=sentinel-2',
      '?imagery=NDVI',
      '?imagery=',
      '?imagery=https%3A%2F%2Fevil.example%2Ftiles',
    ]) {
      expect(parseAppUrl(search).state.imagery).toBeNull();
    }
    // Absent means the established default.
    expect(parseAppUrl('').state.imagery).toBeNull();
    expect(parseAppUrl('?layer=earthquakes').state.imagery).toBeNull();
  });

  it('round-trips a supported selection and preserves unrelated state', () => {
    const parsed = parseAppUrl(
      '?layer=earthquakes&renderer=cesium&imagery=gibs-modis-truecolor',
    );
    expect(parsed.state.imagery).toBe('gibs-modis-truecolor');
    expect(parsed.passthrough).toEqual([['renderer', 'cesium']]);
    // Canonical order: known params first, passthrough re-appended after.
    expect(serializeAppState(parsed.state, parsed.passthrough)).toBe(
      '?layer=earthquakes&imagery=gibs-modis-truecolor&renderer=cesium',
    );
  });

  it('canonicalizes unknown imagery ids away without touching other params', () => {
    expect(
      serializeAppState(parseAppUrl('?layer=earthquakes&imagery=nope').state, []),
    ).toBe('?layer=earthquakes');
  });

  it('keeps legacy URLs byte-identical (no imagery param, no behavior change)', () => {
    expect(
      serializeAppState(
        parseAppUrl('?layer=earthquakes&event=eonet-1').state,
        parseAppUrl('?layer=earthquakes&event=eonet-1').passthrough,
      ),
    ).toBe('?layer=earthquakes&event=eonet-1');
  });
});

describe('isValidEventId edge cases', () => {
  it('mirrors the route charset/length contract', () => {
    expect(isValidEventId(null)).toBe(false);
    expect(isValidEventId('')).toBe(false);
    expect(isValidEventId('ok_123.-x')).toBe(true);
    expect(isValidEventId('x'.repeat(128))).toBe(true);
    expect(isValidEventId('x'.repeat(129))).toBe(false);
    expect(isValidEventId('fire-34.1--118.2')).toBe(true);
    expect(isValidEventId('fire--12.5-45.0')).toBe(true);
    expect(isValidEventId('fire-34.1-')).toBe(false);
  });
});
