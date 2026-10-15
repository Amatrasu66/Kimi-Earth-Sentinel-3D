import { useState, useCallback, useEffect, useRef } from 'react';
import {
  parseAppUrl,
  serializeAppState,
  DEFAULT_FIRST_RUN_LAYER,
} from '@/lib/url-state';
import type { AppView } from '@/lib/url-state';
import { parseImageryUrlValue } from '@/components/globe/imageryLayers';
import type { LayerId } from '@/types';
import type { SeverityFilterValue } from '@/components/intelligence/SeverityFilter';

interface UseAppUrlStateOptions {
  /** Selected event id (or null) for the state→URL sync. */
  selectedEventId: string | null;
  /** Clears the event selection (owns abort + detail state). */
  clearEventSelection: () => void;
}

export interface AppUrlStateApi {
  activeLayer: LayerId | null;
  searchQuery: string;
  severityFilter: SeverityFilterValue;
  view: AppView;
  /** Validated event id awaiting resolvable layer data (deep link). */
  pendingEventId: string | null;
  /**
   * Validated base-imagery id (Phase 4). `null` means the established
   * default; unknown ids never reach state (they fall back on parse).
   */
  baseImagery: string | null;
  setActiveLayer: (layer: LayerId | null) => void;
  setSearchQuery: (q: string) => void;
  setSeverityFilter: (sev: SeverityFilterValue) => void;
  setView: (view: AppView) => void;
  /** Select a supported base imagery (unknown ids resolve to default). */
  setBaseImagery: (layerId: string | null) => void;
  /** Take-and-clear the pending id (deep-link resolution consumes it). */
  clearPendingEvent: () => void;
  /** Drop an unresolvable pending id from the URL (replace, never push). */
  dropPendingEventFromUrl: () => void;
}

/**
 * URL-driven application state (T3.3, extracted T3.17).
 *
 * Owns the bidirectional sync between the address bar and the URL-backed
 * atoms (layer/search/severity/view plus the pending deep-link event id):
 * initial parse + canonicalization, the T3.8 first-run default, the
 * push-vs-replace history conventions, and Back/Forward via popstate.
 * Pure parsing/serialization stays in `src/lib/url-state.ts` — this hook
 * only orchestrates it against React state and `window.history`.
 *
 * Consuming the pending id against loaded layer data lives in
 * `usePendingEventResolution` (declared after the data hook — layer
 * payloads only exist downstream of this hook's own `activeLayer`).
 *
 * All window/history access is effect-only, so SSR output stays
 * deterministic. Interaction handlers (layer toggle, selection, focus)
 * live with their own owners and talk to this hook through its setters.
 */
export function useAppUrlState(options: UseAppUrlStateOptions): AppUrlStateApi {
  const { selectedEventId, clearEventSelection } = options;

  // Deterministic SSR-safe constants; the live URL applies after mount.
  const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterValue>('all');
  const [view, setView] = useState<AppView>('globe');
  // Phase 4: discrete base-imagery selection. `null` is the established
  // default (parameter omitted); opacity and overlay visibility stay in
  // local-storage preferences so continuous slider input never touches
  // history.
  const [baseImagery, setBaseImageryState] = useState<string | null>(null);
  // Validated event id awaiting resolvable layer data. State (not a ref)
  // so data arrival reliably retriggers resolution.
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);

  // - passthroughRef: unknown params (notably `renderer`) preserved verbatim.
  // - syncArmedRef/lastDiscreteRef: the sync effect skips its first run
  //   (mount commit still holds pre-restore defaults — writing then would
  //   wipe the URL it is about to restore). Discrete navigations
  //   (layer/event/sev/view) push Back-restorable entries; query typing
  //   only replaces.
  const passthroughRef = useRef<[string, string][]>([]);
  const lastDiscreteRef = useRef('');
  const syncArmedRef = useRef(false);
  const restoredRef = useRef(false);

  // Apply one parsed URL to state: mount restore and every popstate.
  // Invalid values never reach state; a validated event id becomes pending
  // until loaded layer data resolves it to a real point — or drops it.
  // T3.8: initial mount only (`applyDefaultLayer`) resolves an absent or
  // invalid `?layer=` to the owner-locked default through this same path.
  // Popstate restores exactly what the URL says (null stays null) so an
  // explicit close is never resurrected by history travel.
  const applyUrlState = useCallback(
    (search: string, opts?: { applyDefaultLayer?: boolean }) => {
      const parsed = parseAppUrl(search);
      passthroughRef.current = parsed.passthrough;
      const layer = parsed.state.layer ?? (opts?.applyDefaultLayer ? DEFAULT_FIRST_RUN_LAYER : null);
      setActiveLayer(layer);
      setSearchQuery(parsed.state.q);
      setSeverityFilter(parsed.state.sev);
      setView(parsed.state.view);
      setBaseImageryState(parsed.state.imagery);
      clearEventSelection();
      setPendingEventId(parsed.state.event);
      // Canonicalize invalid leftovers without history spam (mount junk
      // URLs and hand-edited addresses collapse in place). With the
      // first-run default this also records `?layer=earthquakes` via
      // replace — no extra entry, no loop (re-serializing is a fixed point).
      const canonical = serializeAppState({ ...parsed.state, layer }, parsed.passthrough);
      if (canonical !== search) {
        window.history.replaceState(null, '', canonical || window.location.pathname);
      }
    },
    [clearEventSelection],
  );

  // Mount-only restore: the live URL is external state, read here — never
  // during render — keeping SSR markup deterministic.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    applyUrlState(window.location.search, { applyDefaultLayer: true });
  }, [applyUrlState]);

  // Deep-link consumption for `usePendingEventResolution` (declared after
  // the data hook): take-and-clear the pending id once layer data answers
  // it, or drop it from the URL when it proves unresolvable.
  const clearPendingEvent = useCallback(() => {
    setPendingEventId(null);
  }, []);

  // Unresolvable (stale id, wrong layer, unavailable data): drop it from
  // the URL with a replace so history stays honest — never fabricate.
  const dropPendingEventFromUrl = useCallback(() => {
    const canonical = serializeAppState(
      { layer: activeLayer, event: null, q: searchQuery, sev: severityFilter, view, imagery: baseImagery },
      passthroughRef.current,
    );
    window.history.replaceState(null, '', canonical || window.location.pathname);
  }, [activeLayer, searchQuery, severityFilter, view, baseImagery]);

  // Phase 4: validated base-imagery selection. Unknown ids resolve to the
  // default (`null`) rather than entering state or the URL.
  const setBaseImagery = useCallback((layerId: string | null) => {
    setBaseImageryState(parseImageryUrlValue(layerId));
  }, []);

  // Synchronize state back to the URL (shareable, restorable). Writes only
  // when the canonical form differs — after popstate the state was just
  // derived from the URL, so this skips and cannot loop.
  useEffect(() => {
    const eventId = selectedEventId ?? pendingEventId;
    const discrete = `${activeLayer ?? ''}|${eventId ?? ''}|${severityFilter}|${view}|${baseImagery ?? ''}`;
    if (!syncArmedRef.current) {
      syncArmedRef.current = true;
      lastDiscreteRef.current = discrete;
      return;
    }
    const canonical = serializeAppState(
      { layer: activeLayer, event: eventId, q: searchQuery, sev: severityFilter, view, imagery: baseImagery },
      passthroughRef.current,
    );
    const current = window.location.search;
    if (canonical === current) {
      lastDiscreteRef.current = discrete;
      return;
    }
    const push = discrete !== lastDiscreteRef.current;
    lastDiscreteRef.current = discrete;
    const target = canonical || window.location.pathname;
    if (push) window.history.pushState(null, '', target);
    else window.history.replaceState(null, '', target);
  }, [activeLayer, selectedEventId, pendingEventId, searchQuery, severityFilter, view, baseImagery]);

  // Browser Back/Forward: re-apply the navigated-to URL. push/replace
  // above never fire popstate, so this runs only for genuine traversals.
  useEffect(() => {
    const onPopState = () => {
      applyUrlState(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyUrlState]);

  return {
    activeLayer,
    searchQuery,
    severityFilter,
    view,
    pendingEventId,
    baseImagery,
    setActiveLayer,
    setSearchQuery,
    setSeverityFilter,
    setView,
    setBaseImagery,
    clearPendingEvent,
    dropPendingEventFromUrl,
  };
}
