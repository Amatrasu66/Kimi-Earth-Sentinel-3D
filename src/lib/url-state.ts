/**
 * URL-driven application state (T3.3) — pure parse/serialize/validate.
 *
 * Contract: `?layer=<id>&event=<id>&q=<text>&sev=<level>&view=globe|list`
 * plus the optional `?imagery=<base-layer-id>` (Phase 4: validated against
 * the imagery registry; absent or unknown means the established default).
 * Every parameter mirrors real, existing app capability; nothing here touches
 * React, window, history, or provider calls, so it is fully unit-testable.
 *
 * Validation reuses the authoritative vocabularies (no forks):
 * - layer: `LAYER_IDS` from `@/types` (exact, case-sensitive).
 * - sev: `SEVERITY_FILTERS` from the SeverityFilter control.
 * - event: the events-route rules (1–128 chars, `[A-Za-z0-9_.-]`); `fire-`
 *   ids additionally mirror `parseFireEventId` (two finite in-range numbers)
 *   so a malformed fire id can never trigger a detail lookup.
 * - q: the T1.5 search rules (trimmed, 2–200 chars, no control characters).
 * - view: `globe` (default) or `list`.
 * - imagery: supported base-layer ids from `@/components/globe/imageryLayers`
 *   (exact, case-sensitive; unknown ids are dropped, never defaulted into
 *   something that would trigger provider calls).
 *
 * Parse/serialize round-trip is a fixed point — `serialize(parse(s))` is
 * stable — which is what keeps the history sync loop-free: after applying a
 * URL to state, re-serializing yields the same string, so no write happens.
 * Unknown parameters (notably `renderer`) are never interpreted; they ride
 * along verbatim in encounter order and are re-emitted after the canonical
 * known params.
 */
import { LAYER_IDS } from '@/types';
import type { LayerId } from '@/types';
import {
  IMAGERY_URL_PARAM,
  parseImageryUrlValue,
} from '@/components/globe/imageryLayers';
import { SEVERITY_FILTERS } from '@/components/intelligence/SeverityFilter';
import type { SeverityFilterValue } from '@/components/intelligence/SeverityFilter';

export type AppView = 'globe' | 'list';
export const VIEW_VALUES = ['globe', 'list'] as const;

export interface AppUrlState {
  layer: LayerId | null;
  /** Validated event id (resolution against loaded data happens in the app). */
  event: string | null;
  /** Trimmed query ('' when absent or invalid). */
  q: string;
  sev: SeverityFilterValue;
  view: AppView;
  /**
   * Validated base-imagery id (Phase 4). `null` means the established
   * default and serializes to "parameter omitted", so legacy URLs without
   * `?imagery=` keep their exact behavior.
   */
  imagery: string | null;
}

export const DEFAULT_URL_STATE: AppUrlState = {
  layer: null,
  event: null,
  q: '',
  sev: 'all',
  view: 'globe',
  imagery: null,
};

/**
 * First-run default layer (T3.8, owner-locked): when the application opens
 * without an explicitly specified (valid) `?layer=`, the client selects
 * this layer after mount through the existing layer-state/data path.
 * SSR stays on `DEFAULT_URL_STATE` (layer null) so the static shell is
 * deterministic; the default is applied client-only in an effect.
 */
export const DEFAULT_FIRST_RUN_LAYER: LayerId = 'earthquakes';

export interface ParsedAppUrl {
  state: AppUrlState;
  /** Unknown params (incl. `renderer`), first-wins per key, encounter order. */
  passthrough: [string, string][];
}

const EVENT_ID_RE = /^[A-Za-z0-9_.-]+$/;
export const MAX_EVENT_ID_LENGTH = 128;
export const MAX_QUERY_LENGTH = 200;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

function isSupportedLayerId(value: string): value is LayerId {
  return (LAYER_IDS as readonly string[]).includes(value);
}

function isSupportedSeverity(value: string): value is SeverityFilterValue {
  return (SEVERITY_FILTERS as readonly string[]).includes(value);
}

/** Mirror of the events-route id rules: nothing unresolvable may proceed. */
export function isValidEventId(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_EVENT_ID_LENGTH) return false;
  // Traversal guard (mirrors the events route): `.`/`..` pass the charset.
  if (raw === '.' || raw === '..') return false;
  if (!EVENT_ID_RE.test(raw)) return false;
  if (!raw.startsWith('fire-')) return true;
  // Self-describing fire ids must carry two finite in-range coordinates
  // (mirrors parseFireEventId; negative longitudes contain a second `-`).
  const rest = raw.slice('fire-'.length);
  const sep = rest.indexOf('-', rest.startsWith('-') ? 1 : 0);
  if (sep < 0) return false;
  const latRaw = rest.slice(0, sep);
  const lonRaw = rest.slice(sep + 1);
  if (latRaw === '' || lonRaw === '') return false;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** Mirror of the T1.5 search-input rules: short/over-long/control-char queries never enter state. */
export function isValidSearchQuery(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false;
  const query = raw.trim();
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) return false;
  return !CONTROL_CHARS_RE.test(query);
}

function isValidView(raw: string | null | undefined): raw is AppView {
  return raw === 'globe' || raw === 'list';
}

/**
 * Parse a query string (with or without leading `?`) into validated app
 * state plus passthrough params. Invalid known params are dropped (never
 * defaulted into something that would trigger provider calls); unknown
 * params are preserved verbatim.
 */
export function parseAppUrl(search: string): ParsedAppUrl {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const seen = new Set<string>();
  const passthrough: [string, string][] = [];
  const get = (key: string): string | null => {
    const values = params.getAll(key);
    return values.length > 0 ? (values[0] as string) : null;
  };
  for (const key of params.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (!['layer', 'event', 'q', 'sev', 'view', IMAGERY_URL_PARAM].includes(key)) {
      passthrough.push([key, params.get(key) ?? '']);
    }
  }

  const layerRaw = get('layer');
  const eventRaw = get('event');
  const qRaw = get('q');
  const sevRaw = get('sev');
  const viewRaw = get('view');
  const imageryRaw = get(IMAGERY_URL_PARAM);

  return {
    state: {
      layer: layerRaw !== null && isSupportedLayerId(layerRaw) ? layerRaw : null,
      event: isValidEventId(eventRaw) ? (eventRaw as string) : null,
      q: isValidSearchQuery(qRaw) ? (qRaw as string).trim() : '',
      sev: sevRaw !== null && isSupportedSeverity(sevRaw) ? sevRaw : 'all',
      view: isValidView(viewRaw) ? viewRaw : 'globe',
      imagery: parseImageryUrlValue(imageryRaw),
    },
    passthrough,
  };
}

/**
 * Serialize validated state back to a query string (leading `?`, or `''`
 * when empty). Fixed param order, defaults omitted (`layer`/`event` null,
 * `q` empty, `sev=all`, `view=globe`, `imagery` null), passthrough
 * re-appended (known keys win on collision). Deterministic: equal state
 * always yields equal output.
 */
export function serializeAppState(state: AppUrlState, passthrough: [string, string][] = []): string {
  const params = new URLSearchParams();
  if (state.layer !== null) params.set('layer', state.layer);
  if (state.event !== null) params.set('event', state.event);
  if (state.q !== '') params.set('q', state.q);
  if (state.sev !== 'all') params.set('sev', state.sev);
  if (state.view !== 'globe') params.set('view', state.view);
  if (state.imagery !== null) params.set(IMAGERY_URL_PARAM, state.imagery);
  for (const [key, value] of passthrough) {
    if (['layer', 'event', 'q', 'sev', 'view', IMAGERY_URL_PARAM].includes(key)) continue;
    if (params.has(key)) continue;
    params.append(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
