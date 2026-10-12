import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, MapPin, AlertTriangle, CornerDownLeft } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { hasShortcutModifier, isModalOpen, isTypingTarget } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import type { SearchResult } from '@/types';

interface CommandSearchProps {
  onResultClick: (lat: number, lon: number) => void;
  /** Width constraint from the parent command bar. */
  className?: string;
  /**
   * Controlled query text (T3.3: owned by the app shell so the URL can
   * restore and reflect it). Lookup execution stays here — see the effect
   * below — so debounce/abort behavior is unchanged.
   */
  query: string;
  onQueryChange: (q: string) => void;
  /**
   * Single-key shortcuts enabled (T3.10 Settings toggle). `/` is a
   * character key, so it obeys the same switch as `1..8`/`Space` and its
   * visual hint is hidden while off (WCAG 2.1.4).
   */
  singleKeyShortcuts?: boolean;
}

/**
 * Command-palette search: debounced same-origin lookup, grouped
 * location/event results, full keyboard navigation, `/` to focus.
 * ARIA combobox contract preserved from the previous header search.
 */
export default function CommandSearch({ onResultClick, className, query, onQueryChange, singleKeyShortcuts = true }: CommandSearchProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a result choice (not typing) writes the query: the value effect
  // below must not fire a lookup for it (choosing never searched before).
  const skipNextRef = useRef(false);
  // T3.5: a committed choice also suppresses focus-reopen until the next
  // edit. Without this, refocusing the box after choosing "New York" would
  // reopen the previous lookup's rows under the committed name — a stale,
  // misleading list. Typing (runSearch) or clearing resets the flag.
  const committedRef = useRef(false);
  const { results, loading, error, search } = useSearch();
  // Latest lookup via ref so unrelated parent re-renders (hover, sun tick)
  // never reset the debounce window — only the query text restarts it.
  const searchFnRef = useRef(search);
  useEffect(() => {
    searchFnRef.current = search;
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Single debounced lookup driver (T3.3): typing, external restores
  // (URL/back-forward), and programmatic sets all flow through here with
  // the original 300 ms / 2-char contract. Choosing a result sets
  // skipNextRef so selection never triggers a lookup (as before).
  // Open-state closes stay in event handlers (never derived in-effect).
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        searchFnRef.current(query.trim());
        setOpen(true);
      }, 300);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // "/" focuses search when not typing; preserves existing shortcut system.
  // T3.10 guards: the key obeys the single-key switch, never fires with a
  // modifier chord (browser/OS territory), and stands down behind an open
  // modal so focus is never stolen into a hidden input.
  useEffect(() => {
    if (!singleKeyShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (hasShortcutModifier(e) || e.repeat) return;
      if (e.key !== '/') return;
      if (isTypingTarget(e.target) || isModalOpen()) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [singleKeyShortcuts]);

  const runSearch = useCallback(
    (value: string) => {
      setHighlight(0);
      committedRef.current = false;
      if (value.trim().length < 2) setOpen(false);
      onQueryChange(value);
    },
    [onQueryChange],
  );

  const choose = useCallback(
    (result: SearchResult) => {
      onResultClick(result.lat, result.lon);
      setOpen(false);
      // A choice writes the name without searching (preserved behavior).
      skipNextRef.current = true;
      committedRef.current = true;
      onQueryChange(result.name);
      inputRef.current?.blur();
    },
    [onResultClick, onQueryChange],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    committedRef.current = false;
    onQueryChange('');
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  }, [onQueryChange]);

  // Grouped presentation, flat keyboard order: locations first, then events.
  const sections = useMemo(() => {
    const locations = results.filter((r) => r.type === 'location');
    const events = results.filter((r) => r.type !== 'location');
    const out: Array<{ title: string; items: SearchResult[]; offset: number }> = [];
    if (locations.length > 0) out.push({ title: 'Locations', items: locations, offset: 0 });
    if (events.length > 0) out.push({ title: 'Events', items: events, offset: locations.length });
    return out;
  }, [results]);

  // Canonical display order. Keyboard nav, Enter, and aria-activedescendant
  // must index THIS array — never raw `results`, whose API order can
  // interleave types and would desync highlight from the rendered rows.
  const ordered = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      } else {
        (e.target as HTMLInputElement).blur();
      }
      return;
    }
    if (e.key === 'ArrowDown' && open && ordered.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % ordered.length);
      return;
    }
    if (e.key === 'ArrowUp' && open && ordered.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + ordered.length) % ordered.length);
      return;
    }
    if (e.key === 'Enter') {
      if (open && ordered.length > 0) {
        e.preventDefault();
        choose(ordered[highlight % ordered.length]);
      }
    }
  };

  const safeHighlight = ordered.length > 0 ? highlight % ordered.length : 0;

  // Keep highlighted option visible.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${safeHighlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [safeHighlight]);

  return (
    <div ref={searchRef} className={cn('relative w-full min-w-0 flex-1', className)}>
      <div
        className={cn(
          'flex h-9 items-center gap-2 rounded-[7px] border px-2.5 transition-colors duration-150',
          open ? 'border-sentinel-accent/40 bg-white/[0.06]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]',
        )}
      >
        {loading ? <Spinner className="h-4 w-4 shrink-0 text-white/50" /> : <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />}
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          placeholder="Search locations, events…"
          aria-label="Search locations and events"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="sentinel-search-listbox"
          aria-activedescendant={open && ordered.length > 0 ? `sentinel-search-${ordered[safeHighlight]?.id}` : undefined}
          className="h-full border-0 bg-transparent p-0 text-[13px] text-white shadow-none placeholder:text-white/30 focus-visible:ring-0"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          onFocus={() => {
            // Reopen only for an uncommitted query: after a choice the box
            // holds the committed name (see committedRef) and the previous
            // lookup's rows must not resurface as if they matched it.
            if (!committedRef.current && query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
        />
        {query ? (
          <button
            onClick={clear}
            aria-label="Clear search"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          singleKeyShortcuts && (
            <Kbd className="hidden shrink-0 border-white/10 bg-white/5 text-white/40 sm:inline-flex">/</Kbd>
          )
        )}
      </div>

      {open && (
        <div
          // T3.5: compact, viewport-bounded surface (CSP-1: static caps as
          // classes, no style attribute). The previous fixed 380px panel hung
          // from the centered header deep into the stage and hid the globe +
          // first-run guidance. The min() caps keep the panel small on tall
          // screens and proportional on short/narrow ones; the list itself
          // scrolls. Absolute positioning is unchanged, so the globe never
          // resizes or shifts when results open.
          className="sentinel-elev panel-enter absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(320px,50vh)] overflow-hidden rounded-[10px]"
        >
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
            <span className="sentinel-label">Results</span>
            {results.length > 0 && <span className="sentinel-micro sentinel-mono">{results.length} found</span>}
          </div>
          <Separator className="bg-white/[0.06]" />
          <div ref={listRef} id="sentinel-search-listbox" role="listbox" aria-label="Search results" className="max-h-[min(224px,36vh)] overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-[13px] text-white/40" role="status">
                <Spinner className="h-4 w-4" /> Searching…
              </div>
            ) : error ? (
              <div className="px-2 py-3 text-center" role="alert">
                <p className="text-[13px] text-red-300/90">Search failed</p>
                <p className="sentinel-micro mt-1 truncate">{error}</p>
                <Button variant="outline" size="sm" className="mt-3 border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => search(query.trim())}>
                  Retry
                </Button>
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Search className="mx-auto h-5 w-5 text-white/20" aria-hidden />
                <p className="mt-2 text-[13px] font-medium text-white/70">No results found</p>
                <p className="sentinel-micro mt-1">Try a place name or event — e.g. “Tokyo”, “Etna”.</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.title} role="group" aria-label={section.title}>
                  <p className="sentinel-micro px-2.5 pb-0.5 pt-2 uppercase tracking-wider" aria-hidden="true">{section.title}</p>
                  {section.items.map((result, i) => {
                    const flat = section.offset + i;
                    const active = flat === safeHighlight;
                    return (
                      <button
                        key={result.id}
                        id={`sentinel-search-${result.id}`}
                        data-idx={flat}
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setHighlight(flat)}
                        // False-positive guard: react-hooks/refs taints grouped
                        // `results` derivations as ref-like (the identical flat
                        // pattern in the previous header passed). No `.current`
                        // is read during render — `choose` runs only on click.
                        // eslint-disable-next-line react-hooks/refs
                        onClick={() => choose(ordered[flat])}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150',
                          active ? 'bg-sentinel-accent/[0.12]' : 'hover:bg-white/[0.05]',
                        )}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                          style={{
                            background: result.type === 'location' ? 'var(--sentinel-accent-soft)' : 'rgba(255,69,0,0.12)',
                            border: `1px solid ${result.type === 'location' ? 'var(--sentinel-accent-border)' : 'rgba(255,69,0,0.25)'}`,
                          }}
                          aria-hidden
                        >
                          {result.type === 'location' ? <MapPin className="h-3.5 w-3.5 text-sentinel-accent" /> : <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-white">{result.name}</span>
                          <span className="sentinel-micro sentinel-mono block truncate">
                            {result.lat.toFixed(2)}, {result.lon.toFixed(2)}
                            {result.snippet ? ` · ${result.snippet}` : ''}
                          </span>
                        </span>
                        {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-sentinel-accent/70" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          {results.length > 0 && !loading && (
            <>
              <Separator className="bg-white/[0.06]" />
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="sentinel-micro flex items-center gap-1"><Kbd className="border-white/10 bg-white/5 text-white/40">↑↓</Kbd> navigate</span>
                <span className="sentinel-micro flex items-center gap-1"><Kbd className="border-white/10 bg-white/5 text-white/40">↵</Kbd> fly to</span>
                <span className="sentinel-micro flex items-center gap-1"><Kbd className="border-white/10 bg-white/5 text-white/40">esc</Kbd> close</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
