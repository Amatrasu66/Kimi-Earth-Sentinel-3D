"use client";

/**
 * Sentinel scene-search panel (Phase 6). Dynamic-imported by `SentinelApp`
 * (`ssr: false`) so the form + result UI never enters the initial route
 * bundle — the 200 KiB initial-JS budget stays untouched; the chunk loads
 * only when the user opens Scenes on the Cesium branch.
 *
 * Honesty contract: results are labelled with their provenance (LIVE /
 * CACHED / STALE / UNAVAILABLE); an unavailable catalogue shows an empty
 * result list with the route's message — never fabricated scenes. The
 * Copernicus attribution renders with results by design.
 */
import { useState } from 'react';
import { Satellite, X, Crosshair, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { provenanceChipLabel, resolveProvenance } from '@/lib/provenance';
import { SCENE_COLLECTION_OPTIONS, SCENE_COLLECTION_LABELS } from './sceneCollections';
import type { DataStatus, SceneSearchPayload, SceneSummary } from '@/types';

export interface CommittedSceneQuery {
  bbox: string;
  start: string | null;
  end: string | null;
  collection: string;
}

export interface SceneSearchPanelProps {
  pickedCoord: { lat: number; lon: number } | null;
  committedQuery: CommittedSceneQuery | null;
  results: {
    payload: SceneSearchPayload | null;
    loading: boolean;
    validating: boolean;
    error: string | null;
    dataStatus: DataStatus | null;
    cacheHit: boolean;
  };
  selectedScene: SceneSummary | null;
  onSearch: (query: CommittedSceneQuery) => void;
  onSelect: (scene: SceneSummary) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Default search window: end = today, start = today − 13 days (UTC). */
function defaultDates(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 13 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function aoiFromPick(lat: number, lon: number): string {
  const minLat = Math.max(-90, lat - 0.5);
  const maxLat = Math.min(90, lat + 0.5);
  const minLon = Math.max(-180, lon - 0.5);
  const maxLon = Math.min(180, lon + 0.5);
  return `${minLon.toFixed(2)},${minLat.toFixed(2)},${maxLon.toFixed(2)},${maxLat.toFixed(2)}`;
}

export default function SceneSearchPanel({
  pickedCoord,
  committedQuery,
  results,
  selectedScene,
  onSearch,
  onSelect,
  onClear,
  onClose,
}: SceneSearchPanelProps) {
  const defaults = defaultDates();
  const [bbox, setBbox] = useState(committedQuery?.bbox ?? '');
  const [collection, setCollection] = useState(
    committedQuery?.collection ?? SCENE_COLLECTION_OPTIONS[0],
  );
  const [start, setStart] = useState(committedQuery?.start?.slice(0, 10) ?? defaults.start);
  const [end, setEnd] = useState(committedQuery?.end?.slice(0, 10) ?? defaults.end);
  // `committedQuery` re-seeds happen via a remount (the parent keys the panel
  // on the committed query), so draft edits survive re-renders and a fresh
  // search starts a fresh form — no setState-in-effect cascades.

  const statusKind = resolveProvenance(results.dataStatus, results.cacheHit, null).kind;
  const chipLabel = provenanceChipLabel(results.dataStatus, results.cacheHit);
  const statusColor = `var(--status-${statusKind === 'unknown' ? 'neutral' : statusKind})`;

  const submit = () => {
    if (bbox.trim() === '') return;
    onSearch({ bbox: bbox.trim(), start, end, collection });
  };

  const canSubmit = bbox.trim() !== '' && !results.loading;

  return (
    <section
      id="sentinel-scene-panel"
      tabIndex={-1}
      aria-label="Sentinel scene search"
      className="intel-shell panel-enter min-h-0 w-full max-md:max-h-[52dvh]"
    >
      <div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Satellite className="h-4 w-4 text-sentinel-accent" aria-hidden />
          <h2 className="sentinel-section-title truncate text-white">Sentinel scenes</h2>
          {results.payload && (
            <span className="sentinel-micro sentinel-mono text-white/45">
              {results.payload.count}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {committedQuery && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClear}
                  aria-label="Clear scene results and footprints"
                  className="h-7 w-7 rounded-[6px] text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">
                Clear results and footprints
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="Close scene search"
                className="h-7 w-7 rounded-[6px] text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">
              Close panel
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search form */}
      <form
        className="border-t border-white/[0.06] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label htmlFor="scene-bbox" className="sentinel-label mb-1 block">
              Area (minLon, minLat, maxLon, maxLat)
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                id="scene-bbox"
                value={bbox}
                onChange={(e) => setBbox(e.target.value)}
                placeholder="139.00,34.50,141.00,37.00"
                className="sentinel-mono h-8 flex-1 border-white/10 bg-white/[0.04] text-xs text-white placeholder:text-white/25"
                autoComplete="off"
                spellCheck={false}
              />
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    id="sentinel-scenes-use-pick"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => pickedCoord && setBbox(aoiFromPick(pickedCoord.lat, pickedCoord.lon))}
                    aria-label="Use the last picked globe coordinate as the search area"
                    disabled={!pickedCoord}
                    className="h-8 w-8 shrink-0 rounded-[6px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">
                  {pickedCoord ? 'Use the last picked globe coordinate' : 'Click the globe first to pick a coordinate'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="scene-collection" className="sentinel-label mb-1 block">
                Collection
              </label>
              <select
                id="scene-collection"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className="sentinel-mono h-8 w-full rounded-[6px] border border-white/10 bg-white/[0.04] px-1.5 text-xs text-white outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-sentinel-accent"
              >
                {SCENE_COLLECTION_OPTIONS.map((id) => (
                  <option key={id} value={id} className="bg-sentinel-elev text-black">
                    {SCENE_COLLECTION_LABELS[id]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="scene-start" className="sentinel-label mb-1 block">
                From
              </label>
              <Input
                id="scene-start"
                type="date"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
                className="sentinel-mono h-8 border-white/10 bg-white/[0.04] text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="scene-end" className="sentinel-label mb-1 block">
                To
              </label>
              <Input
                id="scene-end"
                type="date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className="sentinel-mono h-8 border-white/10 bg-white/[0.04] text-xs text-white"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="submit"
              id="sentinel-scenes-search"
              size="sm"
              disabled={!canSubmit}
              className="h-8 gap-1.5 rounded-[6px] bg-sentinel-accent px-3 text-xs font-semibold text-black hover:bg-sentinel-accent/85 disabled:opacity-50"
            >
              {results.loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Satellite className="h-3.5 w-3.5" aria-hidden />
              )}
              Search
            </Button>
            {results.validating && (
              <span className="sentinel-micro text-white/40">Refreshing…</span>
            )}
          </div>
          {results.error && (
            <p role="alert" className="sentinel-micro text-[color:var(--status-error)]">
              {results.error}
            </p>
          )}
        </div>
      </form>

      {/* Results */}
      <ScrollArea className="min-h-0 border-t border-white/[0.06]">
        <div className="px-4 pb-3">
          {results.dataStatus && !results.loading && (
            <div className="flex items-center gap-1.5 py-2" aria-label={`Data status: ${chipLabel}`}>
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 rounded-full', statusKind === 'live' && 'sentinel-live-dot')}
                style={{ background: statusColor }}
              />
              <span aria-hidden className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: statusColor }}>
                {chipLabel}
              </span>
              <span aria-hidden className="sentinel-micro truncate text-white/45">
                {results.dataStatus.source ?? 'Unknown source'}
              </span>
            </div>
          )}
          {results.payload && results.dataStatus?.status !== 'unavailable' && (
            <p aria-hidden className="sentinel-micro pb-2 text-white/35">
              {results.payload.attribution}
            </p>
          )}
          {results.loading && (
            <div className="py-6 text-center">
              <p className="sentinel-micro text-white/45">Searching the Copernicus catalogue…</p>
            </div>
          )}
          {!results.loading && results.payload?.data_status?.status === 'unavailable' && (
            <div role="status" className="py-6 text-center">
              <p className="sentinel-micro text-white/45">
                {results.payload.data_status.message ?? 'Scene data is currently unavailable.'}
              </p>
            </div>
          )}
          {!results.loading && results.payload && results.dataStatus?.status !== 'unavailable' && results.payload.scenes.length === 0 && (
            <div className="py-6 text-center">
              <p className="sentinel-micro text-white/45">No scenes in this area and window.</p>
            </div>
          )}
          {!results.loading &&
            results.payload?.scenes.map((scene) => {
              const selected = selectedScene?.id === scene.id;
              return (
                <div key={scene.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(scene)}
                    aria-expanded={selected}
                    className={cn(
                      'w-full border-b border-white/[0.06] px-0 py-2 text-left transition-colors hover:bg-white/[0.04]',
                      selected && 'bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn('sentinel-mono truncate text-[12px]', selected ? 'text-sentinel-accent' : 'text-white/85')}
                        title={scene.name}
                      >
                        {scene.name}
                      </span>
                      {!scene.online && (
                        <span className="sentinel-micro shrink-0 text-white/35">offline</span>
                      )}
                    </div>
                    <div className="sentinel-micro flex items-center gap-2.5 text-white/40">
                      <span>{scene.content_date.slice(0, 10)}</span>
                      <span>{SCENE_COLLECTION_LABELS[scene.collection]}</span>
                    </div>
                  </button>
                  {selected && (
                    <dl className="border-b border-white/[0.06] px-0 py-2">
                      <dt className="sentinel-label">Scene detail</dt>
                      <dd className="sentinel-micro sentinel-mono mt-1 break-all text-white/55">{scene.id}</dd>
                      <div className="sentinel-micro mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-white/50">
                        <span>Sensed {scene.content_date.replace('T', ' ').slice(0, 19)} UTC</span>
                        <span>
                          Online: {scene.online === null ? 'unknown' : scene.online ? 'yes' : 'no'}
                        </span>
                        <span className="col-span-2">
                          Published{' '}
                          {scene.publication_date
                            ? scene.publication_date.replace('T', ' ').slice(0, 19) + ' UTC'
                            : '— not reported —'}
                        </span>
                      </div>
                      <p className="sentinel-micro mt-2 text-white/35">{results.payload?.attribution}</p>
                    </dl>
                  )}
                </div>
              );
            })}
        </div>
      </ScrollArea>
    </section>
  );
}
