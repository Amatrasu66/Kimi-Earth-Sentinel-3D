"use client";

import { useState, useEffect } from 'react';
import { RotateCw, Activity, Keyboard, Info, Leaf } from 'lucide-react';
import { api, getApiConfig } from '@/services/api';
import { hasNavigatorGpu, probeWebGpuSupport } from '@/lib/webgpu';
import {
  describeLowPowerState,
  probeLowPowerSignals,
} from '@/lib/low-power';
import type { LowPowerPreference } from '@/lib/low-power';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import type { DataStatus, LayerId } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Kbd } from '@/components/ui/kbd';
import { provenanceChipLabel } from '@/lib/provenance';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRotating: boolean;
  onToggleRotation: () => void;
  rendererInfo?: RendererInfo;
  activeLayer?: LayerId | null;
  dataStatus?: DataStatus | null;
  /** Server L1 bit (T3.7): a live result served from cache reads CACHED. */
  cacheHit?: boolean | null;
  /**
   * T3.10 (PRD U-04 / P1-18): single-key shortcuts master switch —
   * turns off `1..8`, `Space`, `?`, and `/` together, persisted by the
   * caller. `Esc` and blur-while-typing stay active regardless.
   */
  singleKeyShortcuts?: boolean;
  onSingleKeyShortcutsChange?: (enabled: boolean) => void;
  /**
   * T4.6 low-power rendering preference (Auto / On / Off), persisted by
   * the caller. `lowPowerActive` is the resolved live state — the UI
   * always shows the preference next to what is actually active.
   */
  lowPowerPreference?: LowPowerPreference;
  onLowPowerPreferenceChange?: (preference: LowPowerPreference) => void;
  lowPowerActive?: boolean;
}

/**
 * Lightweight production diagnostic (Settings → Diagnostics).
 * Shows only safe values: configured API base, backend health + latency,
 * current layer/provenance, and renderer capability. Never any secret.
 */
export interface DiagnosticRowInput {
  apiBase: string;
  apiSource: string;
  health: string | null;
  latencyMs: number | null;
  lastOk: string | null;
  activeLayer?: LayerId | null;
  dataStatus?: DataStatus | null;
  cacheHit?: boolean | null;
  /** OS reduced-motion preference (T3.11 second rotation gate). */
  reducedMotion: boolean;
  /** T4.6 low-power preference + resolved state (optional for old callers). */
  lowPowerPreference?: LowPowerPreference;
  lowPowerActive?: boolean;
  webgpuProbe: string;
  navigatorGpu: boolean;
  rendererInfo?: RendererInfo;
}

/**
 * Pure row builder (T3.13): the rendered list AND the copyable report both
 * consume these rows, so the copied text can never drift from what the UI
 * describes. Every value is already-known client state — no extra network
 * requests, no secrets, no provider URLs (keys could hide in query params).
 */
export function buildDiagnosticRows(input: DiagnosticRowInput): Array<[string, string]> {
  const {
    apiBase,
    apiSource,
    health,
    latencyMs,
    lastOk,
    activeLayer,
    dataStatus,
    cacheHit,
    reducedMotion,
    lowPowerPreference,
    lowPowerActive,
    webgpuProbe,
    navigatorGpu,
    rendererInfo,
  } = input;
  return [
    ['API base', apiBase],
    ['API source', apiSource],
    ['Backend health', health ?? 'checking…'],
    ['API latency', latencyMs === null ? '—' : `${latencyMs} ms`],
    ['Last success', lastOk ?? '—'],
    ['Current layer', activeLayer ?? 'none'],
    ['Data status', dataStatus ? `${provenanceChipLabel(dataStatus, cacheHit ?? null)} · ${dataStatus.source}` : 'no layer data'],
    // Server L1 meaning only: CACHED comes exclusively from meta.cache_hit
    // (T3.6/T3.7) — SWR/client revalidation never implies it.
    ['Server cache', cacheHit === true ? 'hit (served from server cache)' : cacheHit === false ? 'miss (fresh provider response)' : '—'],
    ['Motion preference', reducedMotion ? 'Reduced (system) — auto-rotate and fly-to animations off' : 'Full'],
    // T4.6: the selected preference next to what is actually rendering.
    // Old callers omit both fields and read '—' (never a fabricated mode).
    ['Low-power mode', lowPowerPreference === undefined
      ? '—'
      : describeLowPowerState(lowPowerPreference, lowPowerActive ?? false, probeLowPowerSignals())],
    ['WebGPU', `${navigatorGpu ? 'navigator.gpu present' : 'no navigator.gpu'} · probe ${webgpuProbe}`],
    ['Active renderer', rendererInfo ? `${rendererInfo.active} · ${rendererInfo.detail}` : 'unknown'],
    ['Renderer source', rendererInfo ? rendererInfo.source : '—'],
    ['Earth textures', rendererInfo ? `${rendererInfo.textures.loaded}/${rendererInfo.textures.total} loaded` : '—'],
    [
      'WebGPU frames',
      rendererInfo?.active === 'webgpu'
        ? (rendererInfo.frames !== undefined
            ? `${rendererInfo.frames} submitted — scene is rendering`
            : '0 — loop has not submitted a frame yet')
        : 'n/a (WebGL path)',
    ],
  ];
}

/** Serialize the exact rows the UI shows, with a plain header line. */
export function formatDiagnosticReport(rows: Array<[string, string]>): string {
  return ['Earth Sentinel 3D diagnostics', ...rows.map(([label, value]) => `${label}: ${value}`)].join('\n');
}

function DiagnosticsPanel({
  rendererInfo,
  activeLayer,
  dataStatus,
  cacheHit = null,
  lowPowerPreference,
  lowPowerActive = false,
}: {
  rendererInfo?: RendererInfo;
  activeLayer?: LayerId | null;
  dataStatus?: DataStatus | null;
  cacheHit?: boolean | null;
  lowPowerPreference?: LowPowerPreference;
  lowPowerActive?: boolean;
}) {
  const [health, setHealth] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [webgpuProbe, setWebgpuProbe] = useState<string>('checking…');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const reducedMotion = usePrefersReducedMotion();
  const config = getApiConfig();

  useEffect(() => {
    let cancelled = false;
    probeWebGpuSupport().then((support) => {
      if (!cancelled) {
        setWebgpuProbe(support.supported ? `supported (${support.reason})` : `unsupported (${support.reason})`);
      }
    });
    if (config.error || !config.base) return;
    const started = performance.now();
    api
      .getHealth()
      .then((payload) => {
        if (cancelled) return;
        setHealth(`ok · ${payload.service} v${payload.version}`);
        setLatencyMs(Math.round(performance.now() - started));
        setLastOk(new Date().toISOString());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHealth(`unreachable · ${err instanceof Error ? err.message : 'request failed'}`);
      });
    return () => {
      cancelled = true;
    };
    // Fetch once per dialog open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = buildDiagnosticRows({
    apiBase: config.base || 'not configured',
    apiSource: `${config.source}${config.isProduction ? ' · production build' : ' · dev build'}`,
    health: config.error ? config.error : health,
    latencyMs,
    lastOk,
    activeLayer,
    dataStatus,
    cacheHit,
    reducedMotion,
    lowPowerPreference,
    lowPowerActive,
    webgpuProbe,
    navigatorGpu: hasNavigatorGpu(),
    rendererInfo,
  });

  // Copyable troubleshooting report (T3.13): serializes exactly the rows
  // above — nothing more. Clipboard failure (permissions, insecure context)
  // surfaces as a status message, never a throw. The rows contain no
  // secrets or key-bearing URLs by construction (see buildDiagnosticRows).
  const copyReport = async () => {
    try {
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await clipboard.writeText(formatDiagnosticReport(rows));
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
  };

  return (
    <div className="space-y-2.5">
      <dl className="sentinel-inset space-y-1.5 rounded-lg p-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="sentinel-micro flex-shrink-0">{label}</dt>
            <dd className="break-all text-right text-xs text-white/80">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3">
        <span className="sentinel-micro" role="status">
          {copyState === 'ok'
            ? 'Report copied.'
            : copyState === 'fail'
              ? 'Copy failed — clipboard unavailable.'
              : 'Copy these details for troubleshooting.'}
        </span>
        <button
          type="button"
          onClick={() => void copyReport()}
          aria-label="Copy diagnostics report"
          className="sentinel-micro shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Copy report
        </button>
      </div>
    </div>
  );
}

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['1', '…', '8'], action: 'Toggle environmental layers' },
  { keys: ['Space'], action: 'Pause / resume globe rotation' },
  { keys: ['?'], action: 'Open settings' },
  { keys: ['/'], action: 'Focus search' },
  { keys: ['↑', '↓', '↵'], action: 'Navigate & fly to search results' },
  { keys: ['Esc'], action: 'Close results → back to layer → close panel' },
];

function SettingsBody({
  isRotating,
  onToggleRotation,
  rendererInfo,
  activeLayer,
  dataStatus,
  cacheHit = null,
  singleKeyShortcuts = true,
  onSingleKeyShortcutsChange,
  lowPowerPreference = 'auto',
  onLowPowerPreferenceChange,
  lowPowerActive = false,
}: Omit<SettingsModalProps, 'isOpen' | 'onClose'>) {
  // T4.6 status line: the selected preference next to what is actually
  // rendering (probed synchronously; SSR-safe, same as `hasNavigatorGpu`).
  const lowPowerStatus = describeLowPowerState(
    lowPowerPreference,
    lowPowerActive,
    probeLowPowerSignals(),
  );
  return (
    <Tabs defaultValue="globe" className="min-h-0 gap-0">
      <div className="border-b border-white/[0.07] px-4 pt-2.5">
        <TabsList className="h-8 border border-white/10 bg-white/[0.04] p-0.5" aria-label="Settings sections">
          <TabsTrigger value="globe" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">Globe</TabsTrigger>
          <TabsTrigger value="shortcuts" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">
            <Keyboard className="h-3.5 w-3.5" /> Shortcuts
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">
            <Activity className="h-3.5 w-3.5" /> Diagnostics
          </TabsTrigger>
          <TabsTrigger value="about" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">
            <Info className="h-3.5 w-3.5" /> About
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="max-h-[55dvh] overflow-y-auto overscroll-contain p-4">
        <TabsContent value="globe" className="mt-0 space-y-3">
          <div className="sentinel-inset flex items-center justify-between gap-3 rounded-lg p-3">
            <div className="flex items-start gap-2.5">
              <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-sentinel-accent" aria-hidden />
              <div>
                <Label htmlFor="sentinel-rotate" className="text-[13px] font-medium text-white">Auto-rotate</Label>
                <p className="sentinel-micro mt-0.5">
                  Globe rotates when idle.
                  {singleKeyShortcuts && (
                    <> Also toggled with <Kbd className="border-white/10 bg-white/10 text-white/60">Space</Kbd>.</>
                  )}
                </p>
              </div>
            </div>
            <Switch id="sentinel-rotate" checked={isRotating} onCheckedChange={onToggleRotation} aria-label="Toggle globe auto-rotation" className="data-[state=checked]:bg-sentinel-accent" />
          </div>
          {/* T4.6: Auto / On / Off low-power rendering. Active mode caps
              resolution, forces standard textures and hides the decorative
              cloud shell; reduced motion stays a separate setting. */}
          <div className="sentinel-inset rounded-lg p-3">
            <div className="flex items-start gap-2.5">
              <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-sentinel-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <span id="sentinel-low-power-label" className="text-[13px] font-medium text-white">Low-power mode</span>
                <p className="sentinel-micro mt-0.5">
                  Caps rendering resolution, uses standard textures and hides clouds.
                </p>
              </div>
            </div>
            <div
              role="radiogroup"
              aria-labelledby="sentinel-low-power-label"
              className="mt-2.5 grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-white/[0.04] p-0.5"
            >
              {(['auto', 'on', 'off'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={lowPowerPreference === mode}
                  aria-label={`Low-power mode ${mode}`}
                  onClick={() => onLowPowerPreferenceChange?.(mode)}
                  className={`h-7 rounded-[6px] px-3 text-xs capitalize transition-colors ${
                    lowPowerPreference === mode
                      ? 'bg-sentinel-accent/15 text-sentinel-accent'
                      : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="sentinel-micro sentinel-mono mt-2 text-white/55" role="status">
              {lowPowerStatus}
            </p>
          </div>
          <div className="sentinel-inset rounded-lg p-3">
            <p className="sentinel-micro leading-relaxed">
              Display theme is fixed to the dark command theme so the Earth stays the visual centerpiece.
              Renderer status is always visible in the bottom bar.
            </p>
            <div className="sentinel-micro sentinel-mono mt-2 space-y-1">
              <p className="truncate text-white/55" title={rendererInfo ? `${rendererInfo.active} · ${rendererInfo.detail}` : undefined}>
                renderer — {rendererInfo ? `${rendererInfo.active} · ${rendererInfo.detail}` : '…'}
              </p>
              {activeLayer && (
                <p className="truncate text-sentinel-accent/90" title={`layer — ${activeLayer}`}>
                  layer — {activeLayer}
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="shortcuts" className="mt-0">
          {/* PRD U-04 / P1-18: one switch turns off every single-key entry
              (WCAG 2.1.4 needs a way out of character-key shortcuts);
              persisted by the caller so the choice survives reloads. */}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-start gap-2.5">
              <Keyboard className="mt-0.5 h-4 w-4 shrink-0 text-sentinel-accent" aria-hidden />
              <div>
                <Label htmlFor="sentinel-single-key" className="text-[13px] font-medium text-white">Single-key shortcuts</Label>
                <p className="sentinel-micro mt-0.5">
                  Turns <Kbd className="border-white/10 bg-white/10 text-white/60">1</Kbd>–<Kbd className="border-white/10 bg-white/10 text-white/60">8</Kbd>
                  {' '}<Kbd className="border-white/10 bg-white/10 text-white/60">Space</Kbd>
                  {' '}<Kbd className="border-white/10 bg-white/10 text-white/60">?</Kbd> and
                  {' '}<Kbd className="border-white/10 bg-white/10 text-white/60">/</Kbd> on or off together.
                </p>
              </div>
            </div>
            <Switch
              id="sentinel-single-key"
              checked={singleKeyShortcuts}
              onCheckedChange={(v) => onSingleKeyShortcutsChange?.(v)}
              aria-label="Toggle single-key shortcuts"
              className="data-[state=checked]:bg-sentinel-accent"
            />
          </div>
          <ul className="sentinel-inset divide-y divide-white/[0.05] rounded-lg px-3">
            {SHORTCUTS.map((s) => (
              <li key={s.action} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[13px] text-white/75">{s.action}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k} className="border-white/10 bg-white/[0.07] text-white/70">{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="sentinel-micro mt-2.5 leading-relaxed">
            {singleKeyShortcuts
              ? 'Shortcuts are ignored while typing. Press Esc to blur the search field.'
              : 'Single-key shortcuts are off. Esc still backs out, and search results navigate with ↑ ↓ ↵ while typing.'}
          </p>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-0">
          <DiagnosticsPanel rendererInfo={rendererInfo} activeLayer={activeLayer} dataStatus={dataStatus} cacheHit={cacheHit} lowPowerPreference={lowPowerPreference} lowPowerActive={lowPowerActive} />
        </TabsContent>

        <TabsContent value="about" className="mt-0 space-y-3">
          <div className="sentinel-inset rounded-lg p-3">
            <div className="sentinel-section-title text-white">Earth Sentinel 3D v1.0.0</div>
            <Separator className="my-2 bg-white/[0.07]" />
            <p className="sentinel-micro leading-relaxed">Data sources: NASA EONET, USGS, NASA FIRMS, NOAA, AirNow, Open-Meteo</p>
            <p className="sentinel-micro mt-1 leading-relaxed">Earth textures: NASA Visible Earth (Blue Marble), NASA GIBS</p>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}

// Centered dialog on desktop, bottom sheet on narrow screens — same content,
// same tab logic, no behavior fork.
export default function SettingsModal({ isOpen, onClose, isRotating, onToggleRotation, rendererInfo, activeLayer, dataStatus, cacheHit = null, singleKeyShortcuts = true, onSingleKeyShortcutsChange, lowPowerPreference = 'auto', onLowPowerPreferenceChange, lowPowerActive = false }: SettingsModalProps) {
  const isMobile = useIsMobile();
  const bodyProps = { isRotating, onToggleRotation, rendererInfo, activeLayer, dataStatus, cacheHit, singleKeyShortcuts, onSingleKeyShortcutsChange, lowPowerPreference, onLowPowerPreferenceChange, lowPowerActive };

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="gap-0 p-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="border-b border-white/[0.07]">
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Globe behavior, shortcuts, and diagnostics.</SheetDescription>
          </SheetHeader>
          <SettingsBody {...bodyProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        // T3.9: dvh caps (not vh) so the dialog never extends under mobile
        // browser chrome on tablet widths, where this centered dialog — not
        // the bottom sheet — is used. w-full + max-w keeps <520px viewports
        // bounded (the base max-w-[calc(100%-2rem)] no longer has to).
        className="sentinel-panel max-h-[85dvh] w-full max-w-[520px] gap-0 overflow-hidden border-white/10 bg-sentinel-panel p-0 text-white"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b border-white/[0.07] px-4 py-3 text-left">
          <DialogTitle className="sentinel-section-title text-white">Settings</DialogTitle>
          <DialogDescription className="sentinel-micro">Globe behavior, shortcuts, and diagnostics.</DialogDescription>
        </DialogHeader>
        <SettingsBody {...bodyProps} />
      </DialogContent>
    </Dialog>
  );
}
