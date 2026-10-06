import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Settings, Globe, X, MapPin, AlertTriangle, CornerDownLeft } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DataStatus, SearchResult } from '@/types';
import { statusLabel } from '@/lib/format';

interface TopNavProps {
  onSearchResultClick: (lat: number, lon: number) => void;
  onSettingsClick: () => void;
  /** Optional — shown as a compact provenance badge in the header. */
  dataStatus?: DataStatus | null;
  activeLayerName?: string | null;
}

const STATUS_DOT: Record<string, string> = {
  live: '#34D399',
  simulated: '#FFC31F',
  stale: '#FB923C',
  unavailable: '#F87171',
  unknown: '#9CA3AF',
};

export default function TopNav({ onSearchResultClick, onSettingsClick, dataStatus = null, activeLayerName = null }: TopNavProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { results, loading, error, search } = useSearch();

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

  // "/" focuses search when not typing; preserves existing shortcut system.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setHighlight(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          search(value.trim());
          setOpen(true);
        }, 300);
      } else {
        setOpen(false);
      }
    },
    [search],
  );

  const choose = useCallback(
    (result: SearchResult) => {
      onSearchResultClick(result.lat, result.lon);
      setOpen(false);
      setSearchQuery(result.name);
      inputRef.current?.blur();
    },
    [onSearchResultClick],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery('');
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  }, []);

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
    if (e.key === 'ArrowDown' && open && results.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
      return;
    }
    if (e.key === 'ArrowUp' && open && results.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
      return;
    }
    if (e.key === 'Enter') {
      if (open && results.length > 0) {
        e.preventDefault();
        choose(results[highlight % results.length]);
      }
    }
  };

  const safeHighlight = results.length > 0 ? highlight % results.length : 0;

  // Keep highlighted option visible.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${safeHighlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [safeHighlight]);

  const statusKind = dataStatus?.status ?? 'unknown';
  const showStatus = dataStatus !== null && dataStatus !== undefined;

  return (
    <header
      className="fixed left-0 right-0 top-0 z-[100] flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4"
      style={{
        background: 'rgba(5, 6, 7, 0.72)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Brand */}
      <div className="flex min-w-0 flex-shrink-0 items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'rgba(255,195,31,0.12)', border: '1px solid rgba(255,195,31,0.28)' }}
          aria-hidden
        >
          <Globe className="h-[18px] w-[18px] text-[#FFC31F]" />
        </span>
        <span className="hidden min-w-0 flex-col leading-none md:flex">
          <span className="sentinel-app-title truncate text-white">Earth Sentinel 3D</span>
          <span className="sentinel-micro mt-0.5 truncate">Environmental intelligence</span>
        </span>
        <span className="sentinel-app-title truncate text-white md:hidden">Sentinel</span>
      </div>

      {activeLayerName && (
        <Badge
          variant="secondary"
          className="hidden max-w-[160px] truncate border-[rgba(255,195,31,0.3)] bg-[rgba(255,195,31,0.1)] text-[#FFC31F] lg:inline-flex"
          title={`Active layer: ${activeLayerName}`}
        >
          {activeLayerName}
        </Badge>
      )}

      {/* Search — the primary command interaction */}
      <div ref={searchRef} className="relative mx-auto w-full max-w-[300px] flex-1 sm:max-w-[420px]">
        <div
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg border px-2.5 transition-colors duration-150',
            open ? 'border-[rgba(255,195,31,0.45)] bg-[rgba(255,255,255,0.06)]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]',
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
            aria-activedescendant={open && results.length > 0 ? `sentinel-search-${results[safeHighlight]?.id}` : undefined}
            className="h-full border-0 bg-transparent p-0 text-[13px] text-white shadow-none placeholder:text-white/30 focus-visible:ring-0"
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
            onFocus={() => searchQuery.trim().length >= 2 && setOpen(true)}
            onKeyDown={onInputKeyDown}
          />
          {searchQuery ? (
            <button
              onClick={clear}
              aria-label="Clear search"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Kbd className="hidden shrink-0 border-white/10 bg-white/5 text-white/40 sm:inline-flex">/</Kbd>
          )}
        </div>

        {open && (
          <div
            className="sentinel-elev panel-enter absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl"
            style={{ maxHeight: 380 }}
          >
            <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
              <span className="sentinel-label">Results</span>
              {results.length > 0 && <span className="sentinel-micro sentinel-mono">{results.length} found</span>}
            </div>
            <Separator className="bg-white/[0.06]" />
            <div ref={listRef} id="sentinel-search-listbox" role="listbox" aria-label="Search results" className="max-h-[300px] overflow-y-auto p-1.5">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-8 text-[13px] text-white/40" role="status">
                  <Spinner className="h-4 w-4" /> Searching…
                </div>
              ) : error ? (
                <div className="px-2 py-3 text-center" role="alert">
                  <p className="text-[13px] text-red-300/90">Search failed</p>
                  <p className="sentinel-micro mt-1 truncate">{error}</p>
                  <Button variant="outline" size="sm" className="mt-3 border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => search(searchQuery.trim())}>
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
                results.map((result, i) => {
                  const active = i === safeHighlight;
                  return (
                    <button
                      key={result.id}
                      id={`sentinel-search-${result.id}`}
                      data-idx={i}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => choose(result)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150',
                        active ? 'bg-[rgba(255,195,31,0.12)]' : 'hover:bg-white/[0.05]',
                      )}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        style={{
                          background: result.type === 'location' ? 'rgba(255,195,31,0.12)' : 'rgba(255,69,0,0.12)',
                          border: `1px solid ${result.type === 'location' ? 'rgba(255,195,31,0.25)' : 'rgba(255,69,0,0.25)'}`,
                        }}
                        aria-hidden
                      >
                        {result.type === 'location' ? <MapPin className="h-3.5 w-3.5 text-[#FFC31F]" /> : <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-white">{result.name}</span>
                        <span className="sentinel-micro block truncate">{result.snippet ?? `${result.lat.toFixed(2)}, ${result.lon.toFixed(2)}`}</span>
                      </span>
                      {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#FFC31F]/70" aria-hidden />}
                    </button>
                  );
                })
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

      {/* Right cluster */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {showStatus && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span
                className="mr-0.5 hidden items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 sm:inline-flex"
                role="status"
                aria-label={`Data status: ${statusLabel(dataStatus ?? undefined)}`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', statusKind === 'live' && 'sentinel-live-dot')} style={{ background: STATUS_DOT[statusKind] ?? STATUS_DOT.unknown }} aria-hidden />
                <span className="text-[11px] font-semibold tracking-wide" style={{ color: STATUS_DOT[statusKind] }}>
                  {statusLabel(dataStatus ?? undefined)}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-[#14171d] text-white">
              <span className="text-xs">{dataStatus?.source ?? 'Unknown source'}{dataStatus?.message ? ` — ${dataStatus.message}` : ''}</span>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSettingsClick} aria-label="Open settings" className="h-9 w-9 rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
              <Settings className="h-[18px] w-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="border-white/10 bg-[#14171d] text-white">
            <span className="flex items-center gap-2 text-xs">Settings <Kbd className="border-white/10 bg-white/10 text-white/60">?</Kbd></span>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
